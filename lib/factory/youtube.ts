import fs from "node:fs";
import { google } from "googleapis";

import { prisma } from "@/lib/prisma";

type UploadYoutubeShortInput = {
  filePath: string;
  title: string;
  description?: string;
};

export async function uploadYoutubeShort(input: UploadYoutubeShortInput) {
  const account = await prisma.factoryAccount.findFirst({
    where: {
      platform: "YOUTUBE",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!account) {
    throw new Error("YouTube аккаунт не подключен");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.expiresAt?.getTime(),
  });

  oauth2Client.on("tokens", async (tokens) => {
    await prisma.factoryAccount.update({
      where: {
        id: account.id,
      },
      data: {
        accessToken: tokens.access_token ?? account.accessToken,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : account.expiresAt,
      },
    });
  });

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: input.title,
        description: input.description ?? "",
        categoryId: "20",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(input.filePath),
    },
  });

  const videoId = response.data.id;

  if (!videoId) {
    throw new Error("YouTube не вернул videoId");
  }

  return {
    id: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
