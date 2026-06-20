import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { cancelFactoryJob } from "@/lib/factory/cancel-job";
import { createVkMovieJob } from "@/lib/factory/create-vk-movie-job";
import {
  checkVkSourceVideos,
  getSourceRunDate,
  humanizeVkAutoSourceError,
  isVkGroupOrVideoSourceUrl,
  normalizeVkAutoSourceTimezone,
  normalizeVkSourceUrl,
  runVkAutoSourceDaily,
  vkAutoSourceTimezoneLabel,
} from "@/lib/factory/vk-auto-source";
import {
  answerCallbackQuery,
  editTelegramMessage,
  extractVkVideoUrl,
  humanizeFactoryError,
  sendTelegramMessage,
  upsertTelegramChat,
  type TelegramReplyMarkup,
} from "@/lib/factory/telegram";
import { getVkCookiesStatus } from "@/lib/factory/vk-cookies";

export const runtime = "nodejs";

type TelegramUser = { username?: string; first_name?: string };
type TelegramUpdate = {
  message?: { message_id: number; text?: string; chat: { id: number }; from?: TelegramUser };
  callback_query?: {
    id: string;
    data?: string;
    from: TelegramUser;
    message?: { message_id: number; chat: { id: number } };
  };
};

type JobSettings = { clips: number; seconds: number; interval: number; start: number; end: number };
const DEFAULT_SETTINGS: JobSettings = { clips: 10, seconds: 60, interval: 60, start: 14, end: 23 };

function configuredSecretIsValid(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === expected || request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

function appUrl(path = "/factory") {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : null;
}

function sourceTimeZone(source: { timezone: string }) {
  return normalizeVkAutoSourceTimezone(source.timezone);
}

function sourceTimeZoneLabel(source: { timezone: string }) {
  return vkAutoSourceTimezoneLabel(source.timezone);
}

function denied(chatId: string | number) {
  return sendTelegramMessage(chatId, `⛔ Доступ не выдан. Ваш chatId: ${chatId}`);
}

function mainMenuText() {
  return `🎬 Завод готов.

Что можно сделать:

1) Отправь отдельную VK/VKVideo ссылку — я скачаю видео и создам задачу.
Пример:
https://vk.com/video-123456_789

2) Отправь ссылку на VK-группу или VK Video канал — я добавлю ежедневный автозабор.
Лучшие форматы:
https://vkvideo.ru/@kinobro
https://vk.com/video/@kinobro
https://vk.com/videos-123456789
https://vk.com/video/playlist/-220018529_16
https://vk.ru/video/playlist/-220018529_16

Автозабор:
• каждый день до 10 новых видео
• публикация с 15:00 до 23:00 МСК
• скачивание роликов через vkvideodownload.com

Команды:
/menu — главное меню
/sources — мои источники
/status — задачи
/queue — очередь публикаций
/run_today — запустить автозабор сейчас
/help — помощь
/cookies_help — как подключить VK cookies, если источник не читается`;
}

function mainMenuKeyboard(): TelegramReplyMarkup {
  const factoryUrl = appUrl();
  return {
    inline_keyboard: [
      [
        { text: "📡 Источники", callback_data: "tg:menu:sources" },
        { text: "▶️ Запустить сегодня", callback_data: "tg:menu:run_today" },
      ],
      [
        { text: "📋 Задачи", callback_data: "tg:menu:status" },
        { text: "🗓 Очередь", callback_data: "tg:menu:queue" },
      ],
      [
        { text: "🔐 VK cookies", callback_data: "tg:menu:cookies_help" },
        ...(factoryUrl ? [{ text: "Открыть завод", url: factoryUrl }] : [{ text: "ℹ️ Помощь", callback_data: "tg:menu:help" }]),
      ],
    ],
  };
}


function cookiesHelpText() {
  return `🔐 Как дать боту доступ к списку VK-видео без логина и пароля

VK иногда скрывает список видео от неавторизованного сервера. Тогда нужно один раз экспортировать cookies из своего браузера и добавить их в Railway Variables.

Как сделать:
1. На компьютере открой VK/VKVideo в браузере и войди в свой аккаунт.
2. Установи расширение для экспорта cookies в формате Netscape cookies.txt.
3. Экспортируй cookies для vk.com и vkvideo.ru.
4. В PowerShell закодируй файл cookies.txt в base64:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:/path/cookies.txt")) | Set-Clipboard
5. В Railway добавь переменные и в web, и в worker:
VK_AUTH_MODE=cookies
VK_COOKIES_B64=<то, что скопировалось>
6. Перезапусти web и worker.

Важно:
— не отправляй cookies в Telegram;
— не публикуй cookies в GitHub;
— cookies дают доступ к аккаунту, храни их как секрет;
— если вышел из VK или сменил пароль, cookies могут устареть.`;
}

function parseSettings(value: unknown): JobSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const input = value as Partial<JobSettings>;
  return {
    clips: [5, 10, 20].includes(Number(input.clips)) ? Number(input.clips) : 10,
    seconds: [30, 60].includes(Number(input.seconds)) ? Number(input.seconds) : 60,
    interval: [15, 30, 60].includes(Number(input.interval)) ? Number(input.interval) : 60,
    start: Number(input.start) === 18 ? 18 : 14,
    end: 23,
  };
}

function previewKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 10 видео с 14:00 до 23:00", callback_data: `tg:auto:${id}` }],
      [{ text: "⚙️ Настроить", callback_data: `tg:settings:${id}` }],
      [{ text: "👀 Только проверить", callback_data: `tg:check:${id}` }],
      [{ text: "❌ Отмена", callback_data: `tg:cancel:${id}` }],
    ],
  };
}

function autoSourcePendingKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "✅ Добавить автозабор", callback_data: `tg:autosource:add:${id}` }],
      [{ text: "🔍 Проверить список", callback_data: `tg:autosource:check:${id}` }],
      [{ text: "⚙️ Настроить", callback_data: `tg:autosource:settings:${id}` }],
      [{ text: "❌ Отмена", callback_data: `tg:autosource:cancel:${id}` }],
    ],
  };
}

function autoSourceActionKeyboard(source: { id: string; isEnabled: boolean }): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔍 Проверить список", callback_data: `tg:autosource:check:${source.id}` },
        { text: "▶️ Запустить", callback_data: `tg:autosource:run:${source.id}` },
      ],
      [{ text: "⚙️ Настройки", callback_data: `tg:autosource:settings:${source.id}` }],
      [
        { text: source.isEnabled ? "⏸ Пауза" : "▶️ Включить", callback_data: `tg:autosource:${source.isEnabled ? "pause" : "resume"}:${source.id}` },
        { text: "🗑 Удалить", callback_data: `tg:autosource:delete:${source.id}` },
      ],
      [{ text: "📡 Все источники", callback_data: "tg:menu:sources" }],
    ],
  };
}

function autoSourceSettingsKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [5, 10, 20].map((value) => ({ text: `${value} видео`, callback_data: `tg:autosource:set:${id}:limit:${value}` })),
      [
        { text: "15–23 МСК", callback_data: `tg:autosource:set:${id}:window:15` },
        { text: "18–23 МСК", callback_data: `tg:autosource:set:${id}:window:18` },
      ],
      [{ text: "🔍 Проверить список", callback_data: `tg:autosource:check:${id}` }],
      [{ text: "📡 Назад к источникам", callback_data: "tg:menu:sources" }],
    ],
  };
}

function settingsKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [5, 10, 20].map((n) => ({ text: String(n), callback_data: `tg:set:${id}:clips:${n}` })),
      [30, 60].map((n) => ({ text: `${n} сек`, callback_data: `tg:set:${id}:seconds:${n}` })),
      [15, 30, 60].map((n) => ({ text: n === 60 ? "1 час" : `${n} мин`, callback_data: `tg:set:${id}:interval:${n}` })),
      [
        { text: "14–23", callback_data: `tg:set:${id}:window:14` },
        { text: "18–23", callback_data: `tg:set:${id}:window:18` },
      ],
      [{ text: "🚀 Запустить", callback_data: `tg:auto:${id}` }],
      [{ text: "❌ Отмена", callback_data: `tg:cancel:${id}` }],
    ],
  };
}

function settingsText(settings: JobSettings) {
  return `⚙️ Настройки задачи\n\nСколько роликов? ${settings.clips}\nДлина? ${settings.seconds} сек\nИнтервал? ${settings.interval} мин\nОкно? ${settings.start}:00–${settings.end}:00`;
}

function statusName(status: string) {
  const names: Record<string, string> = {
    QUEUED: "в очереди",
    DOWNLOADING: "скачивание",
    RENDERING: "рендер",
    PUBLISHING: "публикация",
    DONE: "готово",
    FAILED: "ошибка",
    CANCELED: "отменено",
    CREATED: "ожидает запуска",
    PROCESSING: "обрабатывается",
    PUBLISHED: "опубликовано",
    NEW: "новое",
  };
  return names[status] || status.toLowerCase();
}

async function getSourceStats(sourceId: string) {
  const [total, processing, queued, published, failed] = await Promise.all([
    prisma.factoryVkAutoSourceVideo.count({ where: { sourceId } }),
    prisma.factoryVkAutoSourceVideo.count({ where: { sourceId, status: "PROCESSING" } }),
    prisma.factoryVkAutoSourceVideo.count({ where: { sourceId, status: "QUEUED" } }),
    prisma.factoryVkAutoSourceVideo.count({ where: { sourceId, status: "PUBLISHED" } }),
    prisma.factoryVkAutoSourceVideo.count({ where: { sourceId, status: "FAILED" } }),
  ]);
  return { total, inWork: processing + queued, published, failed };
}

async function sourceCardText(source: {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  isEnabled: boolean;
  dailyLimit: number;
  publishStartHour: number;
  publishEndHour: number;
  timezone: string;
  lastRunAt: Date | null;
  lastError: string | null;
}) {
  const stats = await getSourceStats(source.id);
  const lastRun = source.lastRunAt
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: sourceTimeZone(source) }).format(source.lastRunAt)
    : "ещё не запускался";

  return `📡 VK-источник
Название: ${source.sourceTitle || "без названия"}
URL: ${source.sourceUrl}
Статус: ${source.isEnabled ? "включён" : "пауза"}
Видео в день: ${source.dailyLimit}
Окно: ${source.publishStartHour}:00–${source.publishEndHour}:00 МСК
Часовой пояс: ${sourceTimeZoneLabel(source)}
Последний запуск: ${lastRun}
Видео в базе: ${stats.total}
В работе: ${stats.inWork}
Опубликовано: ${stats.published}${stats.failed ? `\nОшибок видео: ${stats.failed}` : ""}${source.lastError ? `\n\nПоследняя ошибка:\n${source.lastError}` : ""}`;
}

async function showSingleSource(chatId: string, sourceId: string) {
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id: sourceId } });
  if (!source) return sendTelegramMessage(chatId, "Источник не найден.");
  return sendTelegramMessage(chatId, await sourceCardText(source), autoSourceActionKeyboard(source));
}

async function showSources(chatDbId: string, telegramChatId: string, runButtons = false) {
  const sources = await prisma.factoryVkAutoSource.findMany({ where: { chatId: chatDbId }, orderBy: { createdAt: "asc" } });
  if (!sources.length) {
    return sendTelegramMessage(
      telegramChatId,
      "📭 Источников пока нет.\n\nПришли ссылку на VK Video канал или группу:\nhttps://vkvideo.ru/@kinobro\nили\nhttps://vk.com/video/@kinobro",
      { inline_keyboard: [[{ text: "➕ Как добавить источник", callback_data: "tg:menu:help" }]] },
    );
  }

  const lines = await Promise.all(sources.map(async (source, index) => `${index + 1}. ${source.sourceTitle || source.sourceUrl}
Статус: ${source.isEnabled ? "включён" : "пауза"}
Каждый день: ${source.dailyLimit} видео
Публикация: ${source.publishStartHour}:00–${source.publishEndHour}:00 МСК
Последний запуск: ${source.lastRunAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: sourceTimeZone(source) }).format(source.lastRunAt) : "ещё не запускался"}${source.lastError ? `\nОшибка: ${source.lastError}` : ""}`));

  const keyboard: TelegramReplyMarkup = {
    inline_keyboard: sources.flatMap((source) =>
      runButtons
        ? [[{ text: `▶️ ${source.sourceTitle || source.sourceUrl.slice(0, 32)}`, callback_data: `tg:autosource:run:${source.id}` }]]
        : [
            [
              { text: `📡 ${source.sourceTitle || source.sourceUrl.slice(0, 26)}`, callback_data: `tg:autosource:view:${source.id}` },
            ],
            [
              { text: "🔍 Проверить", callback_data: `tg:autosource:check:${source.id}` },
              { text: "▶️ Запустить", callback_data: `tg:autosource:run:${source.id}` },
            ],
          ],
    ),
  };

  return sendTelegramMessage(telegramChatId, `📡 Источники:\n\n${lines.join("\n\n")}`, keyboard);
}

async function showStatus(chatDbId: string, telegramChatId: string) {
  const jobs = await prisma.factoryTelegramJob.findMany({
    where: { chatId: chatDbId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { factoryJob: true },
  });
  if (!jobs.length) return sendTelegramMessage(telegramChatId, "Пока нет задач.");
  const base = appUrl("/factory");
  const lines = jobs.map((item, index) => {
    const job = item.factoryJob;
    const source = item.sourceUrl.length > 55 ? `${item.sourceUrl.slice(0, 52)}…` : item.sourceUrl;
    const status = statusName(job?.status || item.status);
    const progress = job ? `${job.progress}%${job.progressLabel ? ` — ${job.progressLabel}` : ""}` : "—";
    return `${index + 1}. ${source}\n${status} · ${progress}${base && job ? `\n${base}` : ""}`;
  });
  return sendTelegramMessage(telegramChatId, `📋 Последние задачи\n\n${lines.join("\n\n")}`);
}

async function showQueue(chatDbId: string, telegramChatId: string) {
  const items = await prisma.factoryTelegramJob.findMany({
    where: { chatId: chatDbId, factoryJob: { status: { in: ["QUEUED", "DOWNLOADING", "RENDERING", "PUBLISHING"] } } },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: { factoryJob: true },
  });
  if (!items.length) return sendTelegramMessage(telegramChatId, "🗓 Очередь публикаций пуста.");
  const lines = items.map((item, i) => {
    const job = item.factoryJob!;
    const when = job.scheduledAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(job.scheduledAt) : "после рендера";
    return `${i + 1}. #${job.id.slice(-8)} — ${when} · ${statusName(job.status)}`;
  });
  return sendTelegramMessage(telegramChatId, `🗓 Ближайшие публикации\n\n${lines.join("\n")}`);
}

async function runSourceNow(chatId: string, sourceId: string, force = true) {
  void runVkAutoSourceDaily(sourceId, { force }).catch((error) => console.error("Manual VK auto-source run failed:", error));
  return sendTelegramMessage(chatId, "📡 Автозабор запущен. Результаты придут отдельными сообщениями.");
}

async function checkSourceAndReply(chatId: string, sourceId: string, messageId?: number) {
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id: sourceId } });
  if (!source) {
    if (messageId) return editTelegramMessage(chatId, messageId, "Источник не найден.");
    return sendTelegramMessage(chatId, "Источник не найден.");
  }

  try {
    const result = await checkVkSourceVideos({ sourceUrl: source.sourceUrl, limit: 10 });
    if (result.videos.length) {
      await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastError: null } });
      const examples = result.videos.slice(0, 3).map((video, index) => `${index + 1}. ${video.title || video.videoUrl}`).join("\n");
      const text = `✅ Источник читается.\nНайдено видео: ${result.videos.length}\n\nПримеры:\n${examples}\n\nМожно запускать автозабор.`;
      if (messageId) return editTelegramMessage(chatId, messageId, text, autoSourceActionKeyboard(source));
      return sendTelegramMessage(chatId, text, autoSourceActionKeyboard(source));
    }

    const lastAttempt = result.attempts[result.attempts.length - 1];
    const vkCookies = await getVkCookiesStatus();
    const authAdvice = vkCookies.enabled
      ? "VK cookies подключены, но список всё равно не найден. Возможные причины: у аккаунта нет доступа, источник закрыт или VK изменил разметку."
      : "Скорее всего VK скрывает список без авторизации. Подключи VK cookies в Railway. Инструкция: /cookies_help";
    const text = `❌ Список видео не прочитался.

Источник:
${source.sourceUrl}

Что попробовать:
1) отправить ссылку именно на раздел видео:
https://vk.com/video/@groupname
2) отправить ссылку формата:
https://vk.com/videos-123456789
3) отправить плейлист:
https://vk.com/video/playlist/-123456789_1
4) отправить 1 отдельную ссылку на видео — она должна скачаться через vkvideodownload.com

${authAdvice}

Технически:
VK cookies: ${vkCookies.enabled ? "ON" : "OFF"}
последняя стратегия: ${lastAttempt?.provider || "нет"}
проверено URL: ${result.attempts.length}
найдено ссылок: 0`;
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastError: "Список видео не прочитался" } });
    if (messageId) return editTelegramMessage(chatId, messageId, text, autoSourceActionKeyboard(source));
    return sendTelegramMessage(chatId, text, autoSourceActionKeyboard(source));
  } catch (error) {
    const reason = humanizeVkAutoSourceError(error);
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastError: reason } });
    const vkCookies = await getVkCookiesStatus();
    const text = `❌ Список видео не прочитался.

Источник:
${source.sourceUrl}

Что попробовать:
1) https://vk.com/video/@groupname
2) https://vk.com/videos-123456789
3) https://vk.com/video/playlist/-123456789_1
4) отдельную ссылку на видео

VK cookies: ${vkCookies.enabled ? "ON" : "OFF"}
${vkCookies.enabled ? "Если список не читается даже с cookies, проверь доступ аккаунта к источнику." : "Если VK скрывает список без авторизации, подключи cookies: /cookies_help"}

Причина:
${reason}`;
    if (messageId) return editTelegramMessage(chatId, messageId, text, autoSourceActionKeyboard(source));
    return sendTelegramMessage(chatId, text, autoSourceActionKeyboard(source));
  }
}

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = String(message.chat.id);
  const chat = await upsertTelegramChat({ chatId, user: message.from });
  if (!chat.isAllowed) return denied(chatId);
  const text = message.text?.trim() || "";
  const command = text.split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, "");

  if (command === "/start" || command === "/menu") return sendTelegramMessage(chatId, mainMenuText(), mainMenuKeyboard());
  if (command === "/help") return sendTelegramMessage(chatId, mainMenuText(), mainMenuKeyboard());
  if (command === "/cookies_help") return sendTelegramMessage(chatId, cookiesHelpText());
  if (command === "/status") return showStatus(chat.id, chatId);
  if (command === "/queue") return showQueue(chat.id, chatId);
  if (command === "/sources" || command === "/source_status") return showSources(chat.id, chatId);
  if (command === "/run_today") {
    const sources = await prisma.factoryVkAutoSource.findMany({ where: { chatId: chat.id, isEnabled: true }, orderBy: { createdAt: "asc" } });
    if (!sources.length) return sendTelegramMessage(chatId, "Нет включённых источников. Открой /sources или пришли ссылку на VK Video канал.");
    if (sources.length === 1) return runSourceNow(chatId, sources[0].id, true);
    return showSources(chat.id, chatId, true);
  }
  if (command === "/pause_sources") {
    const result = await prisma.factoryVkAutoSource.updateMany({ where: { chatId: chat.id }, data: { isEnabled: false } });
    return sendTelegramMessage(chatId, `⏸ Источники приостановлены: ${result.count}.`);
  }
  if (command === "/resume_sources") {
    const result = await prisma.factoryVkAutoSource.updateMany({ where: { chatId: chat.id }, data: { isEnabled: true } });
    return sendTelegramMessage(chatId, `▶️ Источники включены: ${result.count}.`);
  }

  if (isVkGroupOrVideoSourceUrl(text)) {
    const sourceUrl = normalizeVkSourceUrl(text);
    const source = await prisma.factoryVkAutoSource.upsert({
      where: { chatId_sourceUrl: { chatId: chat.id, sourceUrl } },
      create: { chatId: chat.id, sourceUrl, isEnabled: false, timezone: "Europe/Moscow" },
      update: { timezone: "Europe/Moscow" },
    });

    if (source.isEnabled) {
      return sendTelegramMessage(chatId, `📡 Этот источник уже добавлен.\n\n${await sourceCardText(source)}\n\nЧто сделать?`, autoSourceActionKeyboard(source));
    }

    return sendTelegramMessage(chatId, `📡 Похоже, это VK-источник.

Добавить его в ежедневный автозабор?

Настройки:
• ${source.dailyLimit} видео в день
• публикация с ${source.publishStartHour}:00 до ${source.publishEndHour}:00 МСК
• часовой пояс: ${sourceTimeZoneLabel(source)}`, autoSourcePendingKeyboard(source.id));
  }

  const sourceUrl = extractVkVideoUrl(text);
  if (!sourceUrl) {
    const hasVkLikeUrl = /https?:\/\/(?:www\.)?(?:m\.)?(?:vk\.com|vk\.ru|vkvideo\.ru)\//i.test(text);
    if (hasVkLikeUrl) {
      return sendTelegramMessage(chatId, `Вижу VK-ссылку, но этот формат пока не поддержан или ссылка обрезалась.

Поддерживаемые форматы:
• отдельное видео: https://vk.com/video-123456_789
• VK Video канал: https://vkvideo.ru/@name
• раздел видео: https://vk.com/videos-123456789
• плейлист: https://vk.com/video/playlist/-123456789_1
• плейлист vk.ru: https://vk.ru/video/playlist/-123456789_1

Пришли полную ссылку, начинающуюся с https://, или открой /menu.`);
    }
    return sendTelegramMessage(chatId, "Не вижу VK/VKVideo ссылки. Пришли полную ссылку, начинающуюся с https://, или открой /menu.");
  }
  const telegramJob = await prisma.factoryTelegramJob.create({ data: { chatId: chat.id, sourceUrl, settings: DEFAULT_SETTINGS } });
  const sent = await sendTelegramMessage(chatId, "🎬 Видео получено.\nСкачивание будет через vkvideodownload.com.\n\nЧто делаем?", previewKeyboard(telegramJob.id));
  await prisma.factoryTelegramJob.update({ where: { id: telegramJob.id }, data: { telegramMessageId: String(sent.message_id) } });
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  const callbackMessage = query.message;
  const chatId = callbackMessage ? String(callbackMessage.chat.id) : "";
  if (!chatId || !query.data) return answerCallbackQuery(query.id, "Сообщение устарело");
  const chat = await upsertTelegramChat({ chatId, user: query.from });
  if (!chat.isAllowed) {
    await answerCallbackQuery(query.id, "Доступ не выдан");
    return denied(chatId);
  }

  const parts = query.data.split(":");

  if (parts[1] === "menu") {
    const action = parts[2];
    await answerCallbackQuery(query.id);
    if (action === "sources") return showSources(chat.id, chatId);
    if (action === "run_today") return handleMessage({ message_id: callbackMessage!.message_id, chat: { id: Number(chatId) }, from: query.from, text: "/run_today" });
    if (action === "status") return showStatus(chat.id, chatId);
    if (action === "queue") return showQueue(chat.id, chatId);
    if (action === "cookies_help") return sendTelegramMessage(chatId, cookiesHelpText());
    return sendTelegramMessage(chatId, mainMenuText(), mainMenuKeyboard());
  }

  if (parts[1] === "autosource") {
    const sourceAction = parts[2];
    const sourceId = parts[3];
    const source = sourceId ? await prisma.factoryVkAutoSource.findFirst({ where: { id: sourceId, chatId: chat.id } }) : null;
    if (!source) return answerCallbackQuery(query.id, "Источник не найден");
    const sourceMessageId = callbackMessage!.message_id;

    if (sourceAction === "view") {
      await answerCallbackQuery(query.id);
      return editTelegramMessage(chatId, sourceMessageId, await sourceCardText(source), autoSourceActionKeyboard(source));
    }

    if (sourceAction === "settings") {
      await answerCallbackQuery(query.id);
      return editTelegramMessage(chatId, sourceMessageId, `⚙️ Настройки автозабора

Видео в день: ${source.dailyLimit}
Окно: ${source.publishStartHour}:00–${source.publishEndHour}:00 МСК
Часовой пояс: ${sourceTimeZoneLabel(source)}`, autoSourceSettingsKeyboard(source.id));
    }

    if (sourceAction === "set") {
      const key = parts[4];
      const value = Number(parts[5]);
      const data = key === "limit" && [5, 10, 20].includes(value)
        ? { dailyLimit: value }
        : key === "window" && [15, 18].includes(value)
          ? { publishStartHour: value, publishEndHour: 23 }
          : null;
      if (!data) return answerCallbackQuery(query.id, "Некорректная настройка");
      const updated = await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data });
      await answerCallbackQuery(query.id, "Сохранено");
      return editTelegramMessage(chatId, sourceMessageId, `⚙️ Настройки автозабора

Видео в день: ${updated.dailyLimit}
Окно: ${updated.publishStartHour}:00–${updated.publishEndHour}:00 МСК
Часовой пояс: ${sourceTimeZoneLabel(updated)}`, autoSourceSettingsKeyboard(source.id));
    }

    if (sourceAction === "check") {
      await answerCallbackQuery(query.id, "Проверяю источник…");
      return checkSourceAndReply(chatId, source.id, sourceMessageId);
    }

    if (sourceAction === "add") {
      await answerCallbackQuery(query.id, "Добавляю источник…");
      const updated = await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: true, timezone: "Europe/Moscow" } });
      try {
        const result = await checkVkSourceVideos({ sourceUrl: updated.sourceUrl, limit: 10 });
        if (result.videos.length) {
          await prisma.factoryVkAutoSource.update({ where: { id: updated.id }, data: { lastError: null } });
          return editTelegramMessage(chatId, sourceMessageId, `✅ Источник добавлен.
Список видео получаю из публичной страницы VK/VK Video.
Скачивание видео: vkvideodownload.com.
Найдено видео: ${result.videos.length}.
Каждый день беру до ${updated.dailyLimit} новых видео и публикую с ${updated.publishStartHour}:00 до ${updated.publishEndHour}:00 МСК.`, autoSourceActionKeyboard(updated));
        }
        await prisma.factoryVkAutoSource.update({ where: { id: updated.id }, data: { lastError: "Список видео не прочитался" } });
        return editTelegramMessage(chatId, sourceMessageId, `⚠️ Источник добавлен, но список видео сейчас не прочитался.

Что попробовать:
1) отправить ссылку именно на раздел видео:
https://vk.com/video/@groupname
2) отправить ссылку формата:
https://vk.com/videos-123456789
3) отправить плейлист:
https://vk.com/video/playlist/-123456789_1
4) отправить 1 отдельную ссылку на видео — она должна скачаться через vkvideodownload.com

Если VK скрывает список без авторизации, подключи cookies: /cookies_help

Я попробую снова при ежедневном запуске.`, autoSourceActionKeyboard(updated));
      } catch (error) {
        const reason = humanizeVkAutoSourceError(error);
        await prisma.factoryVkAutoSource.update({ where: { id: updated.id }, data: { lastError: reason } });
        return editTelegramMessage(chatId, sourceMessageId, `⚠️ Источник добавлен, но список видео сейчас не прочитался.

Попробуй отправить не главную страницу группы, а именно раздел видео:
https://vk.com/videos-123456789
или
https://vk.com/video/@groupname
или плейлист:
https://vk.com/video/playlist/-123456789_1

Скачивание отдельных VK-видео через vkvideodownload.com подключено. Я попробую снова при ежедневном запуске.

Если VK скрывает список без авторизации, подключи cookies: /cookies_help

${reason}`, autoSourceActionKeyboard(updated));
      }
    }

    if (sourceAction === "cancel") {
      if (!source.isEnabled) await prisma.factoryVkAutoSource.delete({ where: { id: source.id } });
      await answerCallbackQuery(query.id, "Отменено");
      return editTelegramMessage(chatId, sourceMessageId, "❌ Добавление автозабора отменено.");
    }

    if (sourceAction === "pause" || sourceAction === "resume") {
      const updated = await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: sourceAction === "resume" } });
      await answerCallbackQuery(query.id, sourceAction === "resume" ? "Источник включён" : "Источник на паузе");
      return editTelegramMessage(chatId, sourceMessageId, await sourceCardText(updated), autoSourceActionKeyboard(updated));
    }

    if (sourceAction === "delete") {
      await prisma.factoryVkAutoSource.delete({ where: { id: source.id } });
      await answerCallbackQuery(query.id, "Удалено");
      return editTelegramMessage(chatId, sourceMessageId, "🗑 Источник удалён.");
    }

    if (sourceAction === "run") {
      const today = getSourceRunDate(sourceTimeZone(source));
      if (source.lastRunDate === today) {
        await answerCallbackQuery(query.id, "Сегодня уже запускался");
        return editTelegramMessage(chatId, sourceMessageId, "Сегодня этот источник уже запускался. Запустить ещё раз и взять только новые видео?", { inline_keyboard: [[{ text: "Да, запустить", callback_data: `tg:autosource:force:${source.id}` }, { text: "Отмена", callback_data: `tg:autosource:cancelrun:${source.id}` }]] });
      }
      await answerCallbackQuery(query.id, "Запускаю…");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Manual VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, `📡 Автозабор запущен:\n${source.sourceUrl}\nИщу до ${source.dailyLimit} новых видео.`, autoSourceActionKeyboard(source));
    }

    if (sourceAction === "force") {
      await answerCallbackQuery(query.id, "Запускаю повторно…");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Forced VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, "📡 Повторный автозабор запущен. Уже обработанные видео будут пропущены.", autoSourceActionKeyboard(source));
    }

    if (sourceAction === "cancelrun") {
      await answerCallbackQuery(query.id, "Отменено");
      return editTelegramMessage(chatId, sourceMessageId, "Запуск отменён.", autoSourceActionKeyboard(source));
    }

    return answerCallbackQuery(query.id, "Неизвестная команда источника");
  }

  const action = parts[1];
  const id = parts[2];
  const telegramJob = id
    ? await prisma.factoryTelegramJob.findFirst({ where: { id, chatId: chat.id }, include: { factoryJob: true } })
    : null;
  if (!telegramJob) return answerCallbackQuery(query.id, "Задача не найдена");
  const messageId = telegramJob.telegramMessageId || callbackMessage!.message_id;
  let settings = parseSettings(telegramJob.settings);

  if (action === "settings") {
    await answerCallbackQuery(query.id);
    return editTelegramMessage(chatId, messageId, settingsText(settings), settingsKeyboard(id));
  }
  if (action === "set") {
    const key = parts[3];
    const value = Number(parts[4]);
    if (key === "clips" && [5, 10, 20].includes(value)) settings.clips = value;
    if (key === "seconds" && [30, 60].includes(value)) settings.seconds = value;
    if (key === "interval" && [15, 30, 60].includes(value)) settings.interval = value;
    if (key === "window" && [14, 18].includes(value)) settings.start = value;
    await prisma.factoryTelegramJob.update({ where: { id }, data: { settings } });
    await answerCallbackQuery(query.id, "Сохранено");
    return editTelegramMessage(chatId, messageId, settingsText(settings), settingsKeyboard(id));
  }
  if (action === "check") {
    await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "CHECKED" } });
    await answerCallbackQuery(query.id, "Ссылка принята");
    return editTelegramMessage(chatId, messageId, "👀 Ссылка похожа на корректную VK/VKVideo ссылку. Задача не запускалась.", previewKeyboard(id));
  }
  if (action === "cancel") {
    if (telegramJob.factoryJobId) await cancelFactoryJob(telegramJob.factoryJobId);
    await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "CANCELED", lastStatusText: "🛑 Задача отменена." } });
    await answerCallbackQuery(query.id, "Отменено");
    return editTelegramMessage(chatId, messageId, "🛑 Задача отменена.");
  }
  if (action === "auto") {
    if (telegramJob.factoryJobId) return answerCallbackQuery(query.id, "Задача уже создана");
    const claimed = await prisma.factoryTelegramJob.updateMany({ where: { id, factoryJobId: null, status: { not: "CREATING" } }, data: { status: "CREATING" } });
    if (claimed.count === 0) return answerCallbackQuery(query.id, "Задача уже создаётся");
    await answerCallbackQuery(query.id, "Создаю задачу…");
    try {
      const job = await createVkMovieJob({
        sourceUrl: telegramJob.sourceUrl,
        clipCount: settings.clips,
        clipSeconds: settings.seconds,
        scheduleMode: "WINDOW",
        scheduleStartHour: settings.start,
        scheduleEndHour: settings.end,
        scheduleIntervalMinutes: settings.interval,
        telegramChatId: chat.id,
      });
      await prisma.factoryTelegramJob.update({ where: { id }, data: { factoryJobId: job.id, status: "QUEUED" } });
      const site = appUrl("/factory");
      const keyboard: TelegramReplyMarkup = { inline_keyboard: [[...(site ? [{ text: "Открыть сайт", url: site }] : []), { text: "Отменить", callback_data: `tg:cancel:${id}` }]] };
      return editTelegramMessage(chatId, messageId, `✅ Задача создана: #${job.id}\n🎬 ${settings.clips} роликов по ${settings.seconds} секунд\n⏰ Публикация: ${settings.start}:00–${settings.end}:00, раз в ${settings.interval === 60 ? "час" : `${settings.interval} мин`}`, keyboard);
    } catch (error) {
      const reason = humanizeFactoryError(error);
      await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "FAILED", lastStatusText: `❌ Ошибка: ${reason}` } });
      return editTelegramMessage(chatId, messageId, `❌ Ошибка: ${reason}`, previewKeyboard(id));
    }
  }
  return answerCallbackQuery(query.id, "Неизвестная команда");
}

export async function POST(request: Request) {
  if (!configuredSecretIsValid(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const update = (await request.json()) as TelegramUpdate;
    if (update.callback_query) await handleCallback(update.callback_query);
    else if (update.message) await handleMessage(update.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook failed:", error);
    return NextResponse.json({ ok: false, error: humanizeFactoryError(error) }, { status: 500 });
  }
}
