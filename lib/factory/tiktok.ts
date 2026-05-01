import fs from "node:fs/promises";

import { prisma } from "@/lib/prisma";

type TikTokTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

type TikTokUserInfoResponse = {
  data?: {
    user?: {
      open_id?: string;
      union_id?: string;
      avatar_url?: string;
      display_name?: string;
    };
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

type TikTokUploadInitResponse = {
  data?: {
    publish_id?: string;
    upload_url?: string;
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
};

type TikTokAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

type UploadTikTokDraftInput = {
  filePath: string;
  title: string;
  description?: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Нет переменной окружения ${name}`);
  }

  return value;
}

function buildExpiresAt(expiresIn?: number) {
  if (!expiresIn) {
    return undefined;
  }

  return new Date(Date.now() + expiresIn * 1000);
}

function assertTikTokOk<T extends { error?: unknown }>(
  data: T,
  fallbackMessage: string,
) {
  const error = data.error as
    | {
        code?: string;
        message?: string;
        log_id?: string;
      }
    | string
    | undefined;

  if (!error) {
    return;
  }

  if (typeof error === "string") {
    throw new Error(`${fallbackMessage}: ${error}`);
  }

  if (error.code && error.code !== "ok") {
    throw new Error(
      `${fallbackMessage}: ${error.code}${
        error.message ? ` — ${error.message}` : ""
      }`,
    );
  }
}

export async function exchangeTikTokCode(
  code: string,
): Promise<TikTokAuthTokens> {
  const body = new URLSearchParams();

  body.set("client_key", getRequiredEnv("TIKTOK_CLIENT_KEY"));
  body.set("client_secret", getRequiredEnv("TIKTOK_CLIENT_SECRET"));
  body.set("code", code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", getRequiredEnv("TIKTOK_REDIRECT_URI"));

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
  });

  const data = (await response.json()) as TikTokTokenResponse;

  if (!response.ok || data.error) {
    throw new Error(
      data.error_description ||
        data.message ||
        data.error ||
        "TikTok token exchange failed",
    );
  }

  if (!data.access_token) {
    throw new Error("TikTok не вернул access_token");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: buildExpiresAt(data.expires_in),
  };
}

async function refreshTikTokToken(input: {
  refreshToken: string;
}): Promise<TikTokAuthTokens> {
  const body = new URLSearchParams();

  body.set("client_key", getRequiredEnv("TIKTOK_CLIENT_KEY"));
  body.set("client_secret", getRequiredEnv("TIKTOK_CLIENT_SECRET"));
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", input.refreshToken);

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
  });

  const data = (await response.json()) as TikTokTokenResponse;

  if (!response.ok || data.error) {
    throw new Error(
      data.error_description ||
        data.message ||
        data.error ||
        "TikTok token refresh failed",
    );
  }

  if (!data.access_token) {
    throw new Error("TikTok не вернул новый access_token");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? input.refreshToken,
    expiresAt: buildExpiresAt(data.expires_in),
  };
}

export async function getTikTokDisplayName(accessToken: string) {
  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set("fields", "open_id,union_id,avatar_url,display_name");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json()) as TikTokUserInfoResponse;

  assertTikTokOk(data, "TikTok user info failed");

  return data.data?.user?.display_name ?? null;
}

async function getTikTokAccount() {
  const account = await prisma.factoryAccount.findFirst({
    where: {
      platform: "TIKTOK",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!account) {
    throw new Error("TikTok аккаунт не подключен");
  }

  const isTokenExpiredOrClose =
    !account.expiresAt ||
    account.expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (!account.refreshToken || !isTokenExpiredOrClose) {
    return account;
  }

  const refreshToken = account.refreshToken;

  const refreshedTokens = await refreshTikTokToken({
    refreshToken,
  });

  return prisma.factoryAccount.update({
    where: {
      id: account.id,
    },
    data: {
      accessToken: refreshedTokens.accessToken,
      refreshToken: refreshedTokens.refreshToken ?? refreshToken,
      expiresAt: refreshedTokens.expiresAt,
    },
  });
}

async function initTikTokUpload(input: {
  accessToken: string;
  fileSize: number;
}) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        source_info: {
          source: "FILE_UPLOAD",
          video_size: input.fileSize,
          chunk_size: input.fileSize,
          total_chunk_count: 1,
        },
      }),
    },
  );

  const data = (await response.json()) as TikTokUploadInitResponse;

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        data.error?.code ||
        "TikTok upload init failed",
    );
  }

  assertTikTokOk(data, "TikTok upload init failed");

  if (!data.data?.upload_url || !data.data?.publish_id) {
    throw new Error("TikTok не вернул upload_url или publish_id");
  }

  return {
    uploadUrl: data.data.upload_url,
    publishId: data.data.publish_id,
  };
}

async function uploadFileToTikTok(input: {
  uploadUrl: string;
  filePath: string;
  fileSize: number;
}) {
  const fileBuffer = await fs.readFile(input.filePath);
  const lastByte = input.fileSize - 1;

  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(input.fileSize),
      "Content-Range": `bytes 0-${lastByte}/${input.fileSize}`,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    throw new Error(
      `TikTok file upload failed: ${response.status} ${text.slice(0, 500)}`,
    );
  }
}

export async function uploadTikTokDraft(input: UploadTikTokDraftInput) {
  const account = await getTikTokAccount();
  const stat = await fs.stat(input.filePath);

  if (stat.size <= 0) {
    throw new Error("TikTok upload failed: файл пустой");
  }

  const init = await initTikTokUpload({
    accessToken: account.accessToken,
    fileSize: stat.size,
  });

  await uploadFileToTikTok({
    uploadUrl: init.uploadUrl,
    filePath: input.filePath,
    fileSize: stat.size,
  });

  return {
    id: init.publishId,
    url: null,
    message:
      "Видео загружено в TikTok как draft. Открой TikTok inbox, чтобы завершить публикацию.",
  };
}
