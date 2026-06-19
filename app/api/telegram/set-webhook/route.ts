import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (!token || !base) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN и APP_BASE_URL должны быть настроены" }, { status: 500 });

  const webhookUrl = `${base}/api/telegram/webhook`;
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ["message", "callback_query"] }),
  });
  const result = await response.json();
  return NextResponse.json({ webhookUrl, telegram: result }, { status: response.ok ? 200 : 502 });
}
