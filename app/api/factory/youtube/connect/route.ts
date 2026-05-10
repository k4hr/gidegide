import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function GET() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      getRequiredEnv("GOOGLE_CLIENT_ID"),
      getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      getRequiredEnv("GOOGLE_REDIRECT_URI"),
    );

    const state = crypto.randomBytes(24).toString("hex");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: false,
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
      ],
      state,
    });

    const response = NextResponse.redirect(authUrl);

    response.cookies.set("youtube_oauth_state", state, {
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
            : "Failed to start YouTube OAuth",
      },
      {
        status: 500,
      },
    );
  }
}
