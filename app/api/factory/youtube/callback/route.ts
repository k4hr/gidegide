import { NextResponse } from "next/server";
import { google } from "googleapis";

import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getCookieValue(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.split("=")[1];
}

function buildAccountName(input: {
  channelTitle: string | null | undefined;
  channelId: string | null | undefined;
}) {
  const baseName = input.channelTitle?.trim() || "YouTube Channel";
  const suffix = input.channelId ? ` ${input.channelId.slice(-6)}` : "";

  return `${baseName}${suffix}`;
}

function buildErrorRedirect(origin: string, message: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;
  const redirectUrl = new URL("/factory/accounts", appUrl);

  redirectUrl.searchParams.set("youtube_error", message);

  return redirectUrl.toString();
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = getCookieValue(cookieHeader, "youtube_oauth_state");

  if (error) {
    return NextResponse.redirect(
      buildErrorRedirect(url.origin, errorDescription ?? error),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      buildErrorRedirect(url.origin, "Google did not return authorization code"),
    );
  }

  if (!state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(
      buildErrorRedirect(url.origin, "Invalid YouTube OAuth state"),
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_CLIENT_ID"),
      getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      getRequiredEnv("GOOGLE_REDIRECT_URI"),
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google did not return access_token");
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

    const accountName = buildAccountName({
      channelTitle: channel?.snippet?.title,
      channelId: channel?.id,
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

    const response = NextResponse.redirect(
      `${appUrl}/factory/accounts?youtube=connected`,
    );

    response.cookies.delete("youtube_oauth_state");

    return response;
  } catch (callbackError) {
    console.error("YouTube OAuth callback error:", callbackError);

    const message =
      callbackError instanceof Error
        ? callbackError.message
        : "Failed to connect YouTube";

    return NextResponse.redirect(buildErrorRedirect(url.origin, message));
  }
}
