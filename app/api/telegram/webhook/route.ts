import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

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
  extractVkVideoUrls,
  humanizeFactoryError,
  sendTelegramMessage,
  upsertTelegramChat,
  type TelegramReplyMarkup,
} from "@/lib/factory/telegram";
import { getVkCookiesStatus } from "@/lib/factory/vk-cookies";

export const runtime = "nodejs";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

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

2) Отправь сразу несколько отдельных VK-видео ссылок — я соберу пакет на несколько дней.
Пример: 10 ссылок = 10 дней, каждый фильм публикуется в своё окно.

3) Отправь ссылку на VK-группу или VK Video канал — я добавлю ежедневный автозабор.
Лучшие форматы:
https://vkvideo.ru/@kinobro
https://vk.com/video/@kinobro
https://vk.com/videos-123456789
https://vk.com/video/playlist/-220018529_16
https://vk.ru/video/playlist/-220018529_16

Команды:
/menu — главное меню
/pack — собрать пакет ссылок на дни
/done — закончить сбор пакета
/sources — мои источники
/status — задачи
/queue — очередь обработки и публикаций
/run_today — запустить автозабор сейчас
/help — помощь
/cookies_help — как подключить VK cookies
/cookies_status — статус cookies и browser listing`;
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
        { text: "📦 Пакет ссылок", callback_data: "tg:menu:pack" },
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

Если Railway пишет, что переменная слишком длинная, разбей base64 на части:
VK_COOKIES_B64_1=первая часть
VK_COOKIES_B64_2=вторая часть
VK_COOKIES_B64_3=третья часть
Бот сам склеит части по порядку.

Важно:
— не отправляй cookies в Telegram;
— не публикуй cookies в GitHub;
— cookies дают доступ к аккаунту, храни их как секрет.`;
}

async function cookiesStatusText() {
  const status = await getVkCookiesStatus();
  return `🔐 VK cookies:
Статус: ${status.enabled ? "ON" : "OFF"}
vk.com/vk.ru: ${status.vkCom ? "yes" : "no"}
vkvideo.ru: ${status.vkVideo ? "yes" : "no"}
remixsid: ${status.hasRemixsid ? "yes" : "no"}
remixdsid: ${status.hasRemixdsid ? "yes" : "no"}
remixstid: ${status.hasRemixstid ? "yes" : "no"}
Playwright listing: ${process.env.VK_LISTING_ENABLE_PLAYWRIGHT?.toLowerCase() === "true" ? "ON" : "OFF"}
yt-dlp listing fallback: ${process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true" ? "ON" : "OFF"}`;
}

type JobSettings = {
  clips: number;
  seconds: number;
  interval?: number;
  startMode: "NOW" | "TIME";
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  firstDay: "TODAY" | "TOMORROW";
  urls?: string[];
  batchId?: string;
};

const TELEGRAM_TIME_ZONE = "Europe/Moscow";
const DEFAULT_SETTINGS: JobSettings = {
  clips: 10,
  seconds: 60,
  interval: 60,
  startMode: "NOW",
  startHour: 18,
  startMinute: 0,
  endHour: 23,
  endMinute: 0,
  firstDay: "TODAY",
};

function parseSettings(value: unknown): JobSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const input = value as Partial<JobSettings> & { start?: number; end?: number; urls?: unknown };
  const startMode = input.startMode === "TIME" ? "TIME" : "NOW";
  const endHour = [21, 22, 23, 24].includes(Number(input.endHour ?? input.end)) ? Number(input.endHour ?? input.end) : 23;
  const startHour = [14, 16, 18, 20, 21, 22].includes(Number(input.startHour ?? input.start)) ? Number(input.startHour ?? input.start) : 18;
  const urls = Array.isArray(input.urls)
    ? input.urls.map((url) => String(url)).filter(Boolean).slice(0, 30)
    : undefined;

  return {
    clips: [5, 10, 20].includes(Number(input.clips)) ? Number(input.clips) : 10,
    seconds: [30, 60].includes(Number(input.seconds)) ? Number(input.seconds) : 60,
    interval: [15, 30, 60].includes(Number(input.interval)) ? Number(input.interval) : 60,
    startMode,
    startHour,
    startMinute: 0,
    endHour,
    endMinute: 0,
    firstDay: input.firstDay === "TOMORROW" ? "TOMORROW" : "TODAY",
    ...(urls ? { urls } : {}),
    ...(typeof input.batchId === "string" ? { batchId: input.batchId } : {}),
  };
}

function timeZoneParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour === 24 ? 0 : (parts.hour ?? 0),
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function makeDateInTimeZone(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const utcGuess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second ?? 0));
  const represented = timeZoneParts(utcGuess, input.timeZone);
  const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second);
  return new Date(utcGuess.getTime() - (representedAsUtc - utcGuess.getTime()));
}

function addDaysToLocalParts(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function getPublishWindow(settings: JobSettings, dayOffset = 0, now = new Date()) {
  const nowParts = timeZoneParts(now, TELEGRAM_TIME_ZONE);
  const localDay = addDaysToLocalParts(nowParts, dayOffset + (settings.firstDay === "TOMORROW" ? 1 : 0));
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  let startAt: Date;

  if (settings.startMode === "NOW" && dayOffset === 0 && settings.firstDay !== "TOMORROW") {
    startAt = now;
  } else if (settings.startMode === "NOW") {
    startAt = makeDateInTimeZone({
      ...localDay,
      hour: nowParts.hour,
      minute: nowParts.minute,
      timeZone: TELEGRAM_TIME_ZONE,
    });
  } else {
    const configured = makeDateInTimeZone({
      ...localDay,
      hour: settings.startHour,
      minute: settings.startMinute,
      timeZone: TELEGRAM_TIME_ZONE,
    });
    startAt = dayOffset === 0 && settings.firstDay !== "TOMORROW" && configured.getTime() <= now.getTime() && nowMinutes < settings.endHour * 60
      ? now
      : configured;
  }

  let endDay = localDay;
  let endHour = settings.endHour;
  if (endHour >= 24) {
    endHour = 0;
    endDay = addDaysToLocalParts(localDay, 1);
  }
  let endAt = makeDateInTimeZone({
    ...endDay,
    hour: endHour,
    minute: settings.endMinute,
    timeZone: TELEGRAM_TIME_ZONE,
  });
  if (endAt.getTime() <= startAt.getTime()) {
    const nextDay = addDaysToLocalParts(timeZoneParts(endAt, TELEGRAM_TIME_ZONE), 1);
    endAt = makeDateInTimeZone({
      ...nextDay,
      hour: endHour,
      minute: settings.endMinute,
      timeZone: TELEGRAM_TIME_ZONE,
    });
  }

  const intervalMinutes = Math.max(1, Math.floor((endAt.getTime() - startAt.getTime()) / Math.max(1, settings.clips) / 60000));
  return { startAt, endAt, intervalMinutes };
}

function formatTimeMsk(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TELEGRAM_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatDateTimeMsk(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: TELEGRAM_TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatEndHour(settings: JobSettings) {
  return settings.endHour === 24 ? "00:00" : `${String(settings.endHour).padStart(2, "0")}:00`;
}

function startLabel(settings: JobSettings) {
  return settings.startMode === "NOW" ? "сейчас" : `${String(settings.startHour).padStart(2, "0")}:00`;
}

function isBatchJobSource(sourceUrl: string) {
  return sourceUrl.startsWith("telegram-batch:");
}

function getBatchUrls(settings: JobSettings) {
  return Array.isArray(settings.urls) ? settings.urls.filter(Boolean) : [];
}

function previewKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 Запустить", callback_data: `tg:auto:${id}` }],
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
      [
        { text: "📋 Очередь", callback_data: "tg:menu:queue" },
        { text: "📊 Статус", callback_data: "tg:menu:status" },
      ],
      [{ text: "⚙️ Настройки", callback_data: `tg:autosource:settings:${source.id}` }],
      [
        { text: source.isEnabled ? "⏸ Выключить" : "▶️ Включить", callback_data: `tg:autosource:${source.isEnabled ? "pause" : "resume"}:${source.id}` },
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

function settingsKeyboard(id: string, isBatch = false): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [5, 10, 20].map((n) => ({ text: String(n), callback_data: `tg:set:${id}:clips:${n}` })),
      [30, 60].map((n) => ({ text: `${n} сек`, callback_data: `tg:set:${id}:seconds:${n}` })),
      [
        { text: "сейчас", callback_data: `tg:set:${id}:start:now` },
        { text: "14:00", callback_data: `tg:set:${id}:start:14` },
        { text: "18:00", callback_data: `tg:set:${id}:start:18` },
        { text: "20:00", callback_data: `tg:set:${id}:start:20` },
      ],
      [
        { text: "до 21", callback_data: `tg:set:${id}:end:21` },
        { text: "до 22", callback_data: `tg:set:${id}:end:22` },
        { text: "до 23", callback_data: `tg:set:${id}:end:23` },
        { text: "до 00", callback_data: `tg:set:${id}:end:24` },
      ],
      ...(isBatch
        ? [[
            { text: "сегодня", callback_data: `tg:set:${id}:firstday:today` },
            { text: "завтра", callback_data: `tg:set:${id}:firstday:tomorrow` },
          ]]
        : []),
      [{ text: isBatch ? "🚀 Создать пакет" : "🚀 Запустить", callback_data: `tg:auto:${id}` }],
      [{ text: "❌ Отмена", callback_data: `tg:cancel:${id}` }],
    ],
  };
}

function settingsText(settings: JobSettings, urlsCount = 1) {
  const publishWindow = getPublishWindow(settings);
  const totalPublications = urlsCount * settings.clips;
  const warning = publishWindow.intervalMinutes < 15
    ? `\n\n⚠️ Интервал ~${publishWindow.intervalMinutes} мин. Это часто. Лучше расширить окно или уменьшить количество роликов.`
    : "";

  if (urlsCount > 1) {
    const first = getPublishWindow(settings, 0);
    const last = getPublishWindow(settings, urlsCount - 1);
    return `⚙️ Настройки пакета\n\nСсылок: ${urlsCount}\nРоликов с каждого фильма: ${settings.clips}\nВсего публикаций: ${totalPublications}\nДлина: ${settings.seconds} сек\nПервый день: ${settings.firstDay === "TOMORROW" ? "завтра" : "сегодня"}\nСтарт: ${startLabel(settings)}\nДо: ${formatEndHour(settings)}\nРаспределение: равномерно внутри окна\nИнтервал внутри дня: ~${first.intervalMinutes} мин\nПериод: ${formatDateTimeMsk(first.startAt)} — ${formatDateTimeMsk(last.endAt)}${warning}`;
  }

  return `⚙️ Настройки задачи\n\nСколько роликов? ${settings.clips}\nДлина? ${settings.seconds} сек\nСтарт? ${startLabel(settings)}\nДо? ${formatEndHour(settings)}\nРаспределение? равномерно\nПубликации: ${formatTimeMsk(publishWindow.startAt)}–${formatTimeMsk(publishWindow.endAt)}\nИнтервал: ~${publishWindow.intervalMinutes} мин${warning}`;
}

function batchDraftKeyboard(id: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [{ text: "⚙️ Настроить пакет", callback_data: `tg:settings:${id}` }],
      [{ text: "🚀 Создать пакет", callback_data: `tg:auto:${id}` }],
      [{ text: "❌ Отмена", callback_data: `tg:cancel:${id}` }],
    ],
  };
}

function formatFactoryJobStatus(status?: string | null) {
  const names: Record<string, string> = {
    QUEUED: "В очереди",
    DOWNLOADING: "Скачивается",
    RENDERING: "Рендерится",
    PUBLISHING: "Публикуется",
    DONE: "Готово",
    FAILED: "Ошибка",
    CANCELED: "Отменено",
    CREATED: "Ожидает запуска",
    PROCESSING: "Обрабатывается",
  };
  return status ? names[status] || status : "—";
}

function formatFactoryPublishStatus(status?: string | null) {
  const names: Record<string, string> = {
    QUEUED: "В очереди",
    UPLOADING: "Загружается",
    PUBLISHED: "Опубликовано",
    FAILED: "Ошибка",
    SKIPPED: "Пропущено",
    CANCELED: "Отменено",
  };
  return status ? names[status] || status : "—";
}

function truncateText(value: string | null | undefined, max = 72) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "—";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function formatDateMsk(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  }).format(value);
}

function limitTelegramText(text: string, max = 3900) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 32)}\n\n…сообщение обрезано`;
}

function cleanJobTitlePrefix(value: string | null | undefined) {
  const title = (value || "").replace(/^VK_RU:/, "").replace(/\s+/g, " ").trim();
  return title || null;
}

type TelegramVisibleJob = {
  id: string;
  sourceUrl: string | null;
  sourceOriginalName: string | null;
  titlePrefix: string;
  status: string;
  progress: number;
  progressLabel: string | null;
  error: string | null;
  scheduledAt: Date | null;
  createdAt: Date;
  targets: Array<{ account: { name: string; platform: string } }>;
  telegramJobs: Array<{ sourceUrl: string }>;
  vkAutoSourceVideos: Array<{
    title: string | null;
    videoUrl: string;
    error: string | null;
    source: { sourceTitle: string | null; sourceUrl: string };
  }>;
};

function formatJobTitle(job: TelegramVisibleJob) {
  return truncateText(
    job.sourceOriginalName ||
      cleanJobTitlePrefix(job.titlePrefix) ||
      job.vkAutoSourceVideos[0]?.title ||
      job.vkAutoSourceVideos[0]?.source.sourceTitle ||
      job.telegramJobs[0]?.sourceUrl ||
      job.sourceUrl ||
      job.vkAutoSourceVideos[0]?.videoUrl ||
      job.id,
  );
}

function formatJobAccount(job: TelegramVisibleJob) {
  return job.targets[0]?.account?.name || "—";
}

function getJobError(job: TelegramVisibleJob) {
  return job.error || job.vkAutoSourceVideos.find((video) => video.error)?.error || null;
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

function telegramJobOwnerWhere(chatDbId: string) {
  return {
    OR: [
      { telegramJobs: { some: { chatId: chatDbId } } },
      { vkAutoSourceVideos: { some: { source: { chatId: chatDbId } } } },
    ],
  };
}

const TELEGRAM_JOB_INCLUDE = {
  targets: {
    include: {
      account: { select: { name: true, platform: true } },
    },
    take: 1,
  },
  telegramJobs: {
    select: { sourceUrl: true },
    take: 1,
  },
  vkAutoSourceVideos: {
    select: {
      title: true,
      videoUrl: true,
      error: true,
      source: { select: { sourceTitle: true, sourceUrl: true } },
    },
    take: 1,
  },
} as const;

async function showStatus(chatDbId: string, telegramChatId: string) {
  const jobs = await prisma.factoryJob.findMany({
    where: telegramJobOwnerWhere(chatDbId),
    orderBy: { createdAt: "desc" },
    take: 10,
    include: TELEGRAM_JOB_INCLUDE,
  });

  if (!jobs.length) return sendTelegramMessage(telegramChatId, "Пока нет задач.");

  const base = appUrl("/factory");
  const lines = jobs.map((job, index) => {
    const visibleJob = job as unknown as TelegramVisibleJob;
    const error = getJobError(visibleJob);
    const parts = [
      `${index + 1}. ${formatJobTitle(visibleJob)}`,
      `   Статус: ${formatFactoryJobStatus(visibleJob.status)}`,
      `   Прогресс: ${visibleJob.progress}%`,
      `   Этап: ${visibleJob.progressLabel || "—"}`,
      `   Аккаунт: ${formatJobAccount(visibleJob)}`,
      `   Создано: ${formatDateMsk(visibleJob.createdAt)}`,
      `   Job ID: ${visibleJob.id.slice(-8)}`,
    ];

    if (visibleJob.status === "FAILED") {
      parts.push(`   Причина: ${error || "Причина ошибки не записана, смотри worker logs"}`);
    }

    if (base) parts.push(`   Сайт: ${base}`);
    return parts.join("\n");
  });

  return sendTelegramMessage(telegramChatId, limitTelegramText(`📋 Последние задачи\n\n${lines.join("\n\n")}`));
}

async function showQueue(chatDbId: string, telegramChatId: string) {
  const processingJobs = await prisma.factoryJob.findMany({
    where: {
      ...telegramJobOwnerWhere(chatDbId),
      status: { in: ["QUEUED", "DOWNLOADING", "RENDERING", "PUBLISHING", "FAILED"] },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: TELEGRAM_JOB_INCLUDE,
  });

  const publications = await prisma.factoryPublish.findMany({
    where: {
      clip: { job: telegramJobOwnerWhere(chatDbId) },
      status: { in: ["QUEUED", "UPLOADING", "FAILED"] },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    include: {
      account: { select: { name: true } },
      target: { include: { account: { select: { name: true } } } },
      clip: {
        select: {
          title: true,
          job: { select: { scheduledAt: true, sourceOriginalName: true, titlePrefix: true } },
        },
      },
    },
  });

  if (!processingJobs.length && !publications.length) {
    return sendTelegramMessage(telegramChatId, "📋 Очередь обработки пуста.\n\n📅 Очередь публикаций пуста.");
  }

  const processingLines = processingJobs.length
    ? processingJobs
        .map((job, index) => {
          const visibleJob = job as unknown as TelegramVisibleJob;
          const error = getJobError(visibleJob);
          return [
            `${index + 1}. ${formatJobTitle(visibleJob)}`,
            `   Статус: ${formatFactoryJobStatus(visibleJob.status)}`,
            `   Прогресс: ${visibleJob.progress}%`,
            `   Этап: ${visibleJob.progressLabel || "—"}`,
            `   Аккаунт: ${formatJobAccount(visibleJob)}`,
            `   Создано: ${formatDateMsk(visibleJob.createdAt)}`,
            `   Job ID: ${visibleJob.id.slice(-8)}`,
            ...(visibleJob.status === "FAILED" ? [`   Причина: ${error || "Причина ошибки не записана, смотри worker logs"}`] : []),
          ].join("\n");
        })
        .join("\n\n")
    : "Активных задач обработки нет.";

  const publishLines = publications.length
    ? publications
        .map((item, index) => {
          const account = item.account?.name || item.target?.account?.name || "—";
          const title = truncateText(item.title || item.clip.title || item.clip.job.sourceOriginalName || cleanJobTitlePrefix(item.clip.job.titlePrefix));
          return [
            `${index + 1}. ${title}`,
            `   Платформа: ${item.platform}`,
            `   Время: ${formatDateMsk(item.clip.job.scheduledAt)}`,
            `   Статус: ${formatFactoryPublishStatus(item.status)}`,
            `   Аккаунт: ${account}`,
            ...(item.error ? [`   Причина: ${item.error}`] : []),
          ].join("\n");
        })
        .join("\n\n")
    : "Публикации появятся после успешного рендера.";

  return sendTelegramMessage(telegramChatId, limitTelegramText(`📋 Очередь обработки\n\n🎬 Рендер / нарезка:\n${processingLines}\n\n📅 Очередь публикаций:\n${publishLines}`));
}

async function runSourceNow(chatId: string, sourceId: string, force = true) {
  void runVkAutoSourceDaily(sourceId, { force }).catch((error) => console.error("Manual VK auto-source run failed:", error));
  return sendTelegramMessage(chatId, "📡 Автозабор запущен.\n\nПубликации появятся после рендера.\nПроверить:\n/queue — очередь обработки\n/status — последние задачи");
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

    const vkCookies = await getVkCookiesStatus();
    const htmlCount = result.attempts.filter((item) => item.provider?.includes("html")).reduce((sum, item) => sum + (item.foundCount || 0), 0);
    const ytDlpAttempt = result.attempts.find((item) => item.provider === "yt-dlp");
    const playwrightAttempts = result.attempts.filter((item) => item.provider === "playwright-browser");
    const playwrightCount = playwrightAttempts.reduce((sum, item) => Math.max(sum, item.foundCount || 0), 0);
    const playwrightError = playwrightAttempts.find((item) => item.error && item.error !== "disabled")?.error;
    const text = `❌ Список видео не прочитался.

Источник:
${source.sourceUrl}

VK cookies: ${vkCookies.enabled ? "ON" : "OFF"}
HTML parser: ${htmlCount}
yt-dlp listing: ${process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true" ? `ON, ${ytDlpAttempt?.foundCount || 0}${ytDlpAttempt?.error ? ` (${ytDlpAttempt.error})` : ""}` : "OFF"}
Playwright listing: ${process.env.VK_LISTING_ENABLE_PLAYWRIGHT?.toLowerCase() === "true" ? `ON, ${playwrightCount}${playwrightError ? ` (${playwrightError})` : ""}` : "OFF"}
Проверено URL: ${result.attempts.length}
Найдено ссылок: 0

Что сделать:
1) убедиться, что cookies от vk.com и vkvideo.ru актуальные;
2) открыть этот источник в браузере под тем же аккаунтом;
3) попробовать ссылку https://vk.com/videos-...;
4) если даже браузерный режим не видит видео — VK не отдаёт список этому аккаунту.

Статус cookies: /cookies_status`;
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


async function getOpenBatchDraft(chatDbId: string) {
  return prisma.factoryTelegramJob.findFirst({
    where: { chatId: chatDbId, status: "BATCH_DRAFT", sourceUrl: { startsWith: "telegram-batch:" } },
    orderBy: { createdAt: "desc" },
  });
}

async function createBatchDraft(chatDbId: string, urls: string[] = []) {
  const batchId = crypto.randomUUID();
  return prisma.factoryTelegramJob.create({
    data: {
      chatId: chatDbId,
      sourceUrl: `telegram-batch:${batchId}`,
      status: "BATCH_DRAFT",
      settings: toPrismaJson({ ...DEFAULT_SETTINGS, startMode: "TIME", startHour: 18, endHour: 23, batchId, urls }),
    },
  });
}

async function showBatchDraft(chatId: string, draft: { id: string; settings: unknown }, editMessageId?: number) {
  const settings = parseSettings(draft.settings);
  const urls = getBatchUrls(settings);
  const text = urls.length
    ? `${settingsText(settings, urls.length)}\n\nКаждая ссылка = отдельный день. Первый фильм — первый день, второй — следующий день.`
    : `📦 Режим пакета включён.\n\nОтправляй VK/VKVideo ссылки одним сообщением или несколькими сообщениями подряд.\nКогда закончишь — нажми «Настроить пакет» или «Создать пакет».`;
  if (editMessageId) return editTelegramMessage(chatId, editMessageId, text, batchDraftKeyboard(draft.id));
  const sent = await sendTelegramMessage(chatId, text, batchDraftKeyboard(draft.id));
  await prisma.factoryTelegramJob.update({ where: { id: draft.id }, data: { telegramMessageId: String(sent.message_id) } });
  return sent;
}

function buildMovieTitleFromUrl(url: string, index: number) {
  try {
    const parsed = new URL(url);
    const id = parsed.pathname.match(/video-?\d+_\d+/i)?.[0] || parsed.pathname.split("/").filter(Boolean).pop();
    return `VK фильм ${index}${id ? ` · ${id}` : ""}`.slice(0, 90);
  } catch {
    return `VK фильм ${index}`;
  }
}

async function createMovieJobForTelegram(input: {
  chatDbId: string;
  sourceUrl: string;
  settings: JobSettings;
  dayOffset?: number;
  movieTitle?: string;
  scheduledAtMode?: "NOW" | "WINDOW_START";
}) {
  const publishWindow = getPublishWindow(input.settings, input.dayOffset || 0);
  const job = await createVkMovieJob({
    sourceUrl: input.sourceUrl,
    movieTitle: input.movieTitle,
    clipCount: input.settings.clips,
    clipSeconds: input.settings.seconds,
    scheduleMode: "WINDOW",
    scheduleStartHour: timeZoneParts(publishWindow.startAt, TELEGRAM_TIME_ZONE).hour,
    scheduleEndHour: input.settings.endHour,
    scheduleIntervalMinutes: publishWindow.intervalMinutes,
    scheduleStartAt: publishWindow.startAt,
    scheduleEndAt: publishWindow.endAt,
    scheduleDistribution: "EVEN",
    telegramChatId: input.chatDbId,
    scheduledAt: input.scheduledAtMode === "WINDOW_START" ? publishWindow.startAt : null,
  });
  return { job, window: publishWindow };
}

async function createBatchJobs(input: {
  chatDbId: string;
  telegramChatId: string;
  draftId: string;
  settings: JobSettings;
}) {
  const urls = getBatchUrls(input.settings);
  if (!urls.length) throw new Error("В пакете нет VK-видео ссылок");
  const created: Array<{ id: string; sourceUrl: string; startAt: Date; endAt: Date }> = [];

  for (const [index, url] of urls.entries()) {
    const plannedWindow = getPublishWindow(input.settings, index);
    const { job, window: publishWindow } = await createMovieJobForTelegram({
      chatDbId: input.chatDbId,
      sourceUrl: url,
      settings: input.settings,
      dayOffset: index,
      movieTitle: buildMovieTitleFromUrl(url, index + 1),
      scheduledAtMode: index === 0 && plannedWindow.startAt.getTime() <= Date.now() ? "NOW" : "WINDOW_START",
    });
    const childSettings = { ...input.settings, batchParentId: input.draftId, batchDayIndex: index + 1 } as Record<string, unknown>;
    delete childSettings.urls;
    await prisma.factoryTelegramJob.create({
      data: {
        chatId: input.chatDbId,
        sourceUrl: url,
        status: "QUEUED",
        factoryJobId: job.id,
        settings: toPrismaJson(childSettings),
      },
    });
    created.push({ id: job.id, sourceUrl: url, startAt: publishWindow.startAt, endAt: publishWindow.endAt });
  }

  await prisma.factoryTelegramJob.update({ where: { id: input.draftId }, data: { status: "BATCH_CREATED", lastStatusText: `Создано задач: ${created.length}` } });
  return created;
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
  if (command === "/cookies_status") return sendTelegramMessage(chatId, await cookiesStatusText());
  if (command === "/status") return showStatus(chat.id, chatId);
  if (command === "/queue") return showQueue(chat.id, chatId);
  if (command === "/sources" || command === "/source_status") return showSources(chat.id, chatId);
  if (command === "/pack" || command === "/batch") {
    const existing = await getOpenBatchDraft(chat.id);
    const draft = existing || await createBatchDraft(chat.id);
    return showBatchDraft(chatId, draft);
  }
  if (command === "/done") {
    const draft = await getOpenBatchDraft(chat.id);
    if (!draft) return sendTelegramMessage(chatId, "Нет открытого пакета. Начни с /pack или отправь несколько VK-видео ссылок одним сообщением.");
    return showBatchDraft(chatId, draft);
  }
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

  const videoUrls = extractVkVideoUrls(text);
  const openDraft = await getOpenBatchDraft(chat.id);
  if (openDraft && videoUrls.length) {
    const settings = parseSettings(openDraft.settings);
    const merged = Array.from(new Set([...(settings.urls || []), ...videoUrls])).slice(0, 30);
    const updated = await prisma.factoryTelegramJob.update({ where: { id: openDraft.id }, data: { settings: toPrismaJson({ ...settings, urls: merged }) } });
    return showBatchDraft(chatId, updated, Number(openDraft.telegramMessageId) || undefined);
  }

  if (videoUrls.length > 1) {
    const draft = await createBatchDraft(chat.id, videoUrls);
    return showBatchDraft(chatId, draft);
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
  const telegramJob = await prisma.factoryTelegramJob.create({ data: { chatId: chat.id, sourceUrl, settings: toPrismaJson(DEFAULT_SETTINGS) } });
  const sent = await sendTelegramMessage(chatId, `🎬 Видео получено.
Скачивание будет через vkvideodownload.com.

${settingsText(DEFAULT_SETTINGS)}

Что делаем?`, previewKeyboard(telegramJob.id));
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
    if (action === "pack") {
      const existing = await getOpenBatchDraft(chat.id);
      const draft = existing || await createBatchDraft(chat.id);
      return showBatchDraft(chatId, draft);
    }
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
      return editTelegramMessage(chatId, sourceMessageId, `✅ Автозабор запущен: ${source.sourceUrl}

Ищу до ${source.dailyLimit} новых видео.
Публикации появятся после рендера.
План публикаций: ${source.publishStartHour}:00–${source.publishEndHour}:00.

Проверить:
/queue — очередь обработки
/status — последние задачи`, autoSourceActionKeyboard(source));
    }

    if (sourceAction === "force") {
      await answerCallbackQuery(query.id, "Запускаю повторно…");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Forced VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, `✅ Повторный автозабор запущен: ${source.sourceUrl}

Уже обработанные видео будут пропущены.
Публикации появятся после рендера.
План публикаций: ${source.publishStartHour}:00–${source.publishEndHour}:00.

Проверить:
/queue — очередь обработки
/status — последние задачи`, autoSourceActionKeyboard(source));
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
  const isBatch = isBatchJobSource(telegramJob.sourceUrl);
  const urlsCount = isBatch ? getBatchUrls(settings).length : 1;

  if (action === "settings") {
    await answerCallbackQuery(query.id);
    return editTelegramMessage(chatId, messageId, settingsText(settings, urlsCount), settingsKeyboard(id, isBatch));
  }
  if (action === "set") {
    const key = parts[3];
    const rawValue = parts[4];
    const value = Number(rawValue);
    if (key === "clips" && [5, 10, 20].includes(value)) settings.clips = value;
    if (key === "seconds" && [30, 60].includes(value)) settings.seconds = value;
    if (key === "start") {
      if (rawValue === "now") settings.startMode = "NOW";
      if ([14, 16, 18, 20, 21, 22].includes(value)) {
        settings.startMode = "TIME";
        settings.startHour = value;
        settings.startMinute = 0;
      }
    }
    if (key === "end" && [21, 22, 23, 24].includes(value)) settings.endHour = value;
    if (key === "firstday") settings.firstDay = rawValue === "tomorrow" ? "TOMORROW" : "TODAY";
    if (key === "interval" && [15, 30, 60].includes(value)) settings.interval = value;
    if (key === "window" && [14, 18].includes(value)) {
      settings.startMode = "TIME";
      settings.startHour = value;
      settings.endHour = 23;
    }
    await prisma.factoryTelegramJob.update({ where: { id }, data: { settings: toPrismaJson(settings) } });
    await answerCallbackQuery(query.id, "Сохранено");
    return editTelegramMessage(chatId, messageId, settingsText(settings, urlsCount), settingsKeyboard(id, isBatch));
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
    await answerCallbackQuery(query.id, isBatch ? "Создаю пакет…" : "Создаю задачу…");
    try {
      const site = appUrl("/factory");
      const keyboard: TelegramReplyMarkup = { inline_keyboard: [[...(site ? [{ text: "Открыть сайт", url: site }] : []), { text: "Отменить", callback_data: `tg:cancel:${id}` }]] };

      if (isBatch) {
        const created = await createBatchJobs({ chatDbId: chat.id, telegramChatId: chatId, draftId: id, settings });
        const first = created[0];
        const last = created[created.length - 1];
        return editTelegramMessage(chatId, messageId, `✅ Пакет создан.

Фильмов: ${created.length}
Роликов с каждого: ${settings.clips}
Всего публикаций: ${created.length * settings.clips}
Период: ${first ? formatDateTimeMsk(first.startAt) : "—"} — ${last ? formatDateTimeMsk(last.endAt) : "—"}
Окно каждого дня: ${startLabel(settings)}–${formatEndHour(settings)}

Проверить:
/queue — очередь обработки
/status — последние задачи`, keyboard);
      }

      const publishWindow = getPublishWindow(settings);
      const { job } = await createMovieJobForTelegram({
        chatDbId: chat.id,
        sourceUrl: telegramJob.sourceUrl,
        settings,
        scheduledAtMode: "NOW",
      });
      await prisma.factoryTelegramJob.update({ where: { id }, data: { factoryJobId: job.id, status: "QUEUED" } });
      return editTelegramMessage(chatId, messageId, `✅ Задача создана: #${job.id}
🎬 ${settings.clips} роликов по ${settings.seconds} секунд
⏰ Публикация: ${formatTimeMsk(publishWindow.startAt)}–${formatTimeMsk(publishWindow.endAt)} МСК
⚖️ Распределение: равномерно, примерно каждые ${publishWindow.intervalMinutes} мин`, keyboard);
    } catch (error) {
      const reason = humanizeFactoryError(error);
      await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "FAILED", lastStatusText: `❌ Ошибка: ${reason}` } });
      return editTelegramMessage(chatId, messageId, `❌ Ошибка: ${reason}`, isBatch ? batchDraftKeyboard(id) : previewKeyboard(id));
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
