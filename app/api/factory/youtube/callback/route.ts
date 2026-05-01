import { NextResponse } from "next/server";
import { google } from "googleapis";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function buildAccountName(input: {
  channelTitle: string | null | undefined;
  channelId: string | null | undefined;
}) {
  const baseName = input.channelTitle?.trim() || "YouTube Channel";
  const suffix = input.channelId ? ` ${input.channelId.slice(-6)}` : "";

  return `${baseName}${suffix}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      {
        error: "Google не вернул code",
      },
      {
        status: 400,
      },
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error:
          "Нет GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET или GOOGLE_REDIRECT_URI",
      },
      {
        status: 500,
      },
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    return NextResponse.json(
      {
        error: "Google не вернул access_token",
      },
      {
        status: 500,
      },
    );
  }

  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  const channelsResponse = await youtube.channels.list({
    part: ["snippet"],
    mine: true,
  });

  const channel = channelsResponse.data.items?.[0];
  const channelTitle = channel?.snippet?.title;
  const channelId = channel?.id;
  const accountName = buildAccountName({
    channelTitle,
    channelId,
  });

  await prisma.factoryAccount.upsert({
    where: {
      platform_name: {
        platform: "YOUTUBE",
        name: accountName,
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    },
    create: {
      platform: "YOUTUBE",
      name: accountName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  return NextResponse.redirect(`${appUrl}/factory/accounts?youtube=connected`);
}
