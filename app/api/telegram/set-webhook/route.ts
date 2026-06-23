import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TELEGRAM_COMMANDS = [
  { command: "start", description: "Запустить бота" },
  { command: "menu", description: "Главное меню" },
  { command: "help", description: "Помощь" },
  { command: "instagram_sources", description: "Instagram-источники" },
  { command: "instagram_run_today", description: "Запустить Instagram с выбором окна МСК" },
  { command: "instagram_status", description: "Статус Instagram задач" },
  { command: "queue", description: "Очередь обработки" },
  { command: "set_instagram_cookies", description: "Сохранить Instagram cookies.txt" },
  { command: "instagram_pause", description: "Пауза Instagram автозабора" },
  { command: "instagram_resume", description: "Включить Instagram автозабор" },
];

async function callTelegram(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  return { response, result };
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || request.headers.get("x-admin-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (!token || !base) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN и APP_BASE_URL должны быть настроены" }, { status: 500 });
  }

  const webhookUrl = `${base}/api/telegram/webhook`;
  const webhook = await callTelegram(token, "setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });

  const commands = await callTelegram(token, "setMyCommands", {
    commands: TELEGRAM_COMMANDS,
  });

  const ok = webhook.response.ok && commands.response.ok;
  return NextResponse.json(
    {
      webhookUrl,
      telegram: webhook.result,
      commands: commands.result,
    },
    { status: ok ? 200 : 502 },
  );
}
