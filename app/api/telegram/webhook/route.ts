import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import {
  addInstagramAutoSource,
  checkInstagramAutoSource,
  extractInstagramSourcesFromText,
  humanizeInstagramAutoSourceError,
  listInstagramAutoSources,
  runInstagramAutoSourcesDaily,
  setInstagramSourcesActive,
  normalizeInstagramPublishEndHour,
  formatInstagramPublishWindowLabel,
} from "../../../../lib/factory/instagram-auto-source";
import {
  answerCallbackQuery,
  editTelegramMessage,
  sendTelegramMessage,
  upsertTelegramChat,
  type TelegramReplyMarkup,
} from "../../../../lib/factory/telegram";

export const runtime = "nodejs";

type TelegramUser = { username?: string; first_name?: string };
type TelegramUpdate = {
  message?: { message_id: number; text?: string; chat: { id: number }; from?: TelegramUser };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { message_id: number; chat: { id: number } };
  };
};

function configuredSecretIsValid(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === expected || request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

function appUrl(path = "/factory/instagram-sources") {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : null;
}

function denied(chatId: string | number) {
  return sendTelegramMessage(chatId, `⛔ Доступ не выдан. Ваш chatId: ${chatId}`);
}

function mainMenuText() {
  return `🎬 REDFILM Instagram Auto Sources\n\nОтправь ссылки на публичные Instagram-аккаунты — можно сразу несколько.\n\nЯ каждый день буду брать новые Reels, не повторяться и скачивать 10 роликов в день суммарно. При ручном запуске ты выбираешь окно публикации: с текущего времени до выбранного часа по МСК.\n\nDescription:\nпервая строка всегда: переходи смотреть на REDFILM\nдальше оригинальное описание из Instagram.\n\nКоманды:\n/menu — меню\n/instagram_sources — источники\n/instagram_run_today — выбрать окно и запустить сегодня
/instagram_run_today 23 — запустить сейчас и разложить до 23:00 МСК\n/instagram_pause — пауза\n/instagram_resume — включить\n/instagram_status — статус`;
}

function mainKeyboard(): TelegramReplyMarkup {
  const url = appUrl();
  return {
    inline_keyboard: [
      [
        { text: "📡 Instagram источники", callback_data: "ig:sources" },
        { text: "▶️ Запуск сейчас", callback_data: "ig:run_menu" },
      ],
      [
        { text: "📊 Статус", callback_data: "ig:status" },
        { text: "⏸ Пауза", callback_data: "ig:pause" },
      ],
      [
        { text: "▶️ Включить", callback_data: "ig:resume" },
        ...(url ? [{ text: "Открыть сайт", url }] : [{ text: "ℹ️ Помощь", callback_data: "ig:help" }]),
      ],
    ],
  };
}

function sourceKeyboard(sourceId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔍 Проверить", callback_data: `ig:check:${sourceId}` },
        { text: "▶️ Запуск сейчас", callback_data: "ig:run_menu" },
      ],
      [
        { text: "📡 Источники", callback_data: "ig:sources" },
        { text: "📊 Статус", callback_data: "ig:status" },
      ],
    ],
  };
}

function runWindowKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "сейчас → 18:00 МСК", callback_data: "ig:run_until:18" },
        { text: "сейчас → 20:00 МСК", callback_data: "ig:run_until:20" },
      ],
      [
        { text: "сейчас → 23:00 МСК", callback_data: "ig:run_until:23" },
        { text: "сейчас → 00:00 МСК", callback_data: "ig:run_until:24" },
      ],
      [
        { text: "сейчас → 03:00 МСК", callback_data: "ig:run_until:3" },
        { text: "📡 Источники", callback_data: "ig:sources" },
      ],
    ],
  };
}

function runWindowText() {
  return [
    "▶️ Выбери окно публикации по МСК.",
    "",
    "Ролики будут запланированы с текущего времени до выбранного часа.",
    "Пример: сейчас → 23:00 МСК разложит 10 роликов равномерно до 23:00.",
    "",
    "Можно также написать: /instagram_run_today 23",
  ].join("\n");
}

async function executeRunToday(chatId: string | number, publishEndHourInput: number | string) {
  const publishEndHour = normalizeInstagramPublishEndHour(publishEndHourInput);
  const windowLabel = formatInstagramPublishWindowLabel(publishEndHour);
  await sendTelegramMessage(chatId, `▶️ Запускаю Instagram автозабор: ${windowLabel}...`, mainKeyboard());
  const result = await runInstagramAutoSourcesDaily({
    chatId: String(chatId),
    force: true,
    limit: 10,
    startFromNow: true,
    publishEndHour,
  });
  await sendTelegramMessage(
    chatId,
    `✅ Instagram запуск завершён.\n\nОкно публикаций: ${windowLabel}\nНайдено: ${result.foundCount}\nНовых: ${result.newCount}\nДублей: ${result.duplicateCount}\nСкачано: ${result.downloadedCount}\nСоздано задач: ${result.createdJobsCount}\nОшибок: ${result.failedCount ?? 0}`,
    mainKeyboard(),
  );
}

function formatDate(date?: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

async function sourcesText(chatId: string | number) {
  const sources = await listInstagramAutoSources(String(chatId));
  if (sources.length === 0) {
    return `📡 Instagram-источников пока нет.\n\nОтправь ссылки на публичные аккаунты, например:\nhttps://www.instagram.com/example/`;
  }

  const counts = await prisma.factoryInstagramAutoSourceVideo.groupBy({
    by: ["sourceId", "status"],
    where: { sourceId: { in: sources.map((source) => source.id) } },
    _count: { _all: true },
  });
  const bySource = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const item = bySource.get(row.sourceId) || {};
    item[row.status] = row._count._all;
    bySource.set(row.sourceId, item);
  }

  return [
    "📡 Instagram-источники:",
    "",
    ...sources.map((source, index) => {
      const c = bySource.get(source.id) || {};
      const unused = (c.NEW || 0) + (c.DISCOVERED || 0) + (c.FAILED || 0);
      const used = (c.JOB_CREATED || 0) + (c.PUBLISHED || 0) + (c.DOWNLOADED || 0);
      return `${index + 1}) ${source.sourceTitle || source.username || source.sourceUrl}\n${source.isEnabled ? "🟢 активно" : "⏸ пауза"} · новых в базе: ${unused} · использовано: ${used}\nпоследняя проверка: ${formatDate(source.lastRunAt)}${source.lastError ? `\nошибка: ${source.lastError}` : ""}`;
    }),
  ].join("\n");
}

async function statusText(chatId: string | number) {
  const sources = await listInstagramAutoSources(String(chatId));
  const jobs = await prisma.factoryJob.findMany({
    where: {
      titlePrefix: { startsWith: "INSTAGRAM:" },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      progress: true,
      progressLabel: true,
      sourceOriginalName: true,
      scheduledAt: true,
      error: true,
      createdAt: true,
    },
  });

  const sourceLines = sources.length
    ? sources.map((source) => `• ${source.sourceTitle || source.username || source.sourceUrl}: ${source.isEnabled ? "ON" : "PAUSE"}, last ${formatDate(source.lastRunAt)}${source.lastError ? `, ошибка: ${source.lastError}` : ""}`)
    : ["• источников нет"];

  const jobLines = jobs.length
    ? jobs.map((job, index) => `${index + 1}) ${job.status} · ${job.progress}% · ${job.sourceOriginalName || "Instagram Reel"}\n${job.progressLabel || ""}${job.scheduledAt ? `\nплан: ${formatDate(job.scheduledAt)}` : ""}${job.error ? `\nошибка: ${job.error.slice(0, 250)}` : ""}`)
    : ["задач Instagram пока нет"];

  return [`📊 Instagram status`, "", "Источники:", ...sourceLines, "", "Последние задачи:", ...jobLines].join("\n");
}

async function addSourcesFromText(chatId: string | number, text: string) {
  const urls = extractInstagramSourcesFromText(text);
  if (urls.length === 0) {
    await sendTelegramMessage(chatId, "Не вижу Instagram-аккаунтов. Пришли ссылки вида https://www.instagram.com/username/", mainKeyboard());
    return;
  }

  const added: string[] = [];
  const failed: string[] = [];

  for (const url of urls) {
    try {
      const source = await addInstagramAutoSource({ chatId: String(chatId), sourceUrl: url, dailyLimit: 10 });
      added.push(source.sourceTitle || source.username || source.sourceUrl);
    } catch (error) {
      failed.push(`${url} — ${humanizeInstagramAutoSourceError(error)}`);
    }
  }

  const lines = [
    added.length ? `✅ Добавлено Instagram-источников: ${added.length}` : "Instagram-источники не добавлены.",
    ...added.map((item) => `• ${item}`),
    "",
    "Ежедневно: 10 разных Reels суммарно.",
    "При ручном запуске выберешь окно: с текущего времени до нужного часа МСК.",
    "Повторы будут пропускаться.",
    "",
    "Description будет браться из Instagram, но первая строка всегда: переходи смотреть на REDFILM",
    ...(failed.length ? ["", "Ошибки:", ...failed] : []),
  ];

  await sendTelegramMessage(chatId, lines.join("\n"), mainKeyboard());
}

async function handleCallback(data: string, chatId: string | number, messageId: number) {
  if (data === "ig:help") {
    await editTelegramMessage(chatId, messageId, mainMenuText(), mainKeyboard());
    return;
  }

  if (data === "ig:sources") {
    await editTelegramMessage(chatId, messageId, await sourcesText(chatId), mainKeyboard());
    return;
  }

  if (data === "ig:status") {
    await editTelegramMessage(chatId, messageId, await statusText(chatId), mainKeyboard());
    return;
  }

  if (data === "ig:pause") {
    await setInstagramSourcesActive(String(chatId), false);
    await editTelegramMessage(chatId, messageId, "⏸ Instagram-источники поставлены на паузу.", mainKeyboard());
    return;
  }

  if (data === "ig:resume") {
    await setInstagramSourcesActive(String(chatId), true);
    await editTelegramMessage(chatId, messageId, "▶️ Instagram-источники включены.", mainKeyboard());
    return;
  }

  if (data === "ig:run" || data === "ig:run_menu") {
    await editTelegramMessage(chatId, messageId, runWindowText(), runWindowKeyboard());
    return;
  }

  if (data.startsWith("ig:run_until:")) {
    const hour = data.slice("ig:run_until:".length);
    await editTelegramMessage(
      chatId,
      messageId,
      `▶️ Запуск принят: ${formatInstagramPublishWindowLabel(normalizeInstagramPublishEndHour(hour))}`,
      mainKeyboard(),
    );
    await executeRunToday(chatId, hour);
    return;
  }

  if (data.startsWith("ig:check:")) {
    const id = data.slice("ig:check:".length);
    await editTelegramMessage(chatId, messageId, "🔍 Проверяю Instagram-источник...", mainKeyboard());
    const result = await checkInstagramAutoSource(id);
    await sendTelegramMessage(
      chatId,
      `🔍 Проверка готова.\n\nНайдено: ${result.foundCount}\nНовых: ${result.newCount}\nДублей: ${result.duplicateCount}\n\nПримеры:\n${result.examples.slice(0, 5).join("\n") || "—"}`,
      sourceKeyboard(id),
    );
  }
}

export async function POST(request: Request) {
  if (!configuredSecretIsValid(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  if (update.callback_query?.message) {
    const chatId = update.callback_query.message.chat.id;
    await upsertTelegramChat({ chatId, user: update.callback_query.from });
    if (!process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").map((value) => value.trim()).includes(String(chatId))) {
      await denied(chatId);
      return NextResponse.json({ ok: true });
    }

    const data = update.callback_query.data || "";
    await answerCallbackQuery(update.callback_query.id).catch(() => undefined);
    await handleCallback(data, chatId, update.callback_query.message.message_id).catch((error) =>
      sendTelegramMessage(chatId, `❌ Ошибка: ${humanizeInstagramAutoSourceError(error)}`, mainKeyboard()),
    );
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  await upsertTelegramChat({ chatId, user: message.from });

  if (!process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(",").map((value) => value.trim()).includes(String(chatId))) {
    await denied(chatId);
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim() || "";

  try {
    if (!text || text === "/start" || text === "/help" || text === "/menu") {
      await sendTelegramMessage(chatId, mainMenuText(), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_sources" || text === "/sources") {
      await sendTelegramMessage(chatId, await sourcesText(chatId), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_status" || text === "/status" || text === "/queue") {
      await sendTelegramMessage(chatId, await statusText(chatId), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_pause") {
      await setInstagramSourcesActive(String(chatId), false);
      await sendTelegramMessage(chatId, "⏸ Instagram-источники поставлены на паузу.", mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_resume") {
      await setInstagramSourcesActive(String(chatId), true);
      await sendTelegramMessage(chatId, "▶️ Instagram-источники включены.", mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_run_today" || text === "/run_today") {
      await sendTelegramMessage(chatId, runWindowText(), runWindowKeyboard());
      return NextResponse.json({ ok: true });
    }

    const runCommandMatch = text.match(/^\/(?:instagram_run_today|run_today)\s+(.+)$/i);
    if (runCommandMatch) {
      await executeRunToday(chatId, runCommandMatch[1]);
      return NextResponse.json({ ok: true });
    }

    await addSourcesFromText(chatId, text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ Ошибка: ${humanizeInstagramAutoSourceError(error)}`, mainKeyboard());
    return NextResponse.json({ ok: true });
  }
}
