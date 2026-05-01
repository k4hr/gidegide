import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Нет переменной окружения ${name}`);
  }

  return value;
}

export async function GET() {
  try {
    const clientKey = getRequiredEnv("TIKTOK_CLIENT_KEY");
    const redirectUri = getRequiredEnv("TIKTOK_REDIRECT_URI");

    const state = crypto.randomBytes(24).toString("hex");

    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.upload");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);

    const response = NextResponse.redirect(url.toString());

    response.cookies.set("tiktok_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось начать TikTok OAuth",
      },
      {
        status: 500,
      },
    );
  }
}
