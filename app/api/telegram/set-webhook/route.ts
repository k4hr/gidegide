import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TELEGRAM_COMMANDS = [
  { command: "start", description: "Запустить бота" },
  { command: "menu", description: "Главное меню" },
  { command: "help", description: "Помощь" },
  { command: "sources", description: "VK-источники" },
  { command: "source_status", description: "Статус автозабора" },
  { command: "run_today", description: "Запустить автозабор сейчас" },
  { command: "pause_sources", description: "Остановить автозабор" },
  { command: "resume_sources", description: "Включить автозабор" },
  { command: "status", description: "Задачи" },
  { command: "queue", description: "Очередь публикаций" },
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
