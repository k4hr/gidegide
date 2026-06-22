import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import { getTikTokDisplayName, exchangeTikTokCode } from "../../../../../lib/factory/tiktok";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const cookieHeader = request.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("tiktok_oauth_state="))
    ?.split("=")[1];

  if (error) {
    return NextResponse.json(
      {
        error: errorDescription ?? error,
      },
      {
        status: 400,
      },
    );
  }

  if (!code) {
    return NextResponse.json(
      {
        error: "TikTok не вернул code",
      },
      {
        status: 400,
      },
    );
  }

  if (!state || !stateCookie || state !== stateCookie) {
    return NextResponse.json(
      {
        error: "Некорректный TikTok OAuth state",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const tokens = await exchangeTikTokCode(code);
    const displayName = await getTikTokDisplayName(tokens.accessToken).catch(
      () => null,
    );

    const accountName = displayName || "Main TikTok";

    await prisma.factoryAccount.upsert({
      where: {
        platform_name: {
          platform: "TIKTOK",
          name: accountName,
        },
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
      create: {
        platform: "TIKTOK",
        name: accountName,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
    const response = NextResponse.redirect(
      `${appUrl}/factory/accounts?tiktok=connected`,
    );

    response.cookies.delete("tiktok_oauth_state");

    return response;
  } catch (callbackError) {
    console.error(callbackError);

    return NextResponse.json(
      {
        error:
          callbackError instanceof Error
            ? callbackError.message
            : "Не получилось подключить TikTok",
      },
      {
        status: 500,
      },
    );
  }
}
