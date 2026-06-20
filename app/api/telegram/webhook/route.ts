import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { cancelFactoryJob } from "@/lib/factory/cancel-job";
import { createVkMovieJob } from "@/lib/factory/create-vk-movie-job";
import {
  DEFAULT_VK_AUTO_SOURCE_TIMEZONE,
  getSourceRunDate,
  getVkSourceVideos,
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

function menu(): TelegramReplyMarkup | undefined {
  const url = appUrl();
  return url ? { inline_keyboard: [[{ text: "Открыть завод", url }]] } : undefined;
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

function autoSourceKeyboard(id: string): TelegramReplyMarkup {
  return { inline_keyboard: [
    [{ text: "✅ Добавить автозабор", callback_data: `tg:autosource:add:${id}` }],
    [{ text: "⚙️ Настроить", callback_data: `tg:autosource:settings:${id}` }],
    [{ text: "👀 Проверить источник", callback_data: `tg:autosource:check:${id}` }],
    [{ text: "❌ Отмена", callback_data: `tg:autosource:cancel:${id}` }],
  ] };
}

function autoSourceSettingsKeyboard(id: string): TelegramReplyMarkup {
  return { inline_keyboard: [
    [5, 10, 20].map((value) => ({ text: `${value} видео`, callback_data: `tg:autosource:set:${id}:limit:${value}` })),
    [
      { text: "15–23", callback_data: `tg:autosource:set:${id}:window:15` },
      { text: "18–23", callback_data: `tg:autosource:set:${id}:window:18` },
    ],
    [{ text: "✅ Добавить", callback_data: `tg:autosource:add:${id}` }],
  ] };
}

async function showSources(chatDbId: string, telegramChatId: string, runButtons = false) {
  const sources = await prisma.factoryVkAutoSource.findMany({ where: { chatId: chatDbId }, orderBy: { createdAt: "asc" } });
  if (!sources.length) return sendTelegramMessage(telegramChatId, "📡 Источников пока нет. Пришли ссылку на VK-группу или VK Video канал.");
  const lines = sources.map((source, index) => `${index + 1}. ${source.sourceTitle || source.sourceUrl}
Статус: ${source.isEnabled ? "включён" : "пауза"}
Каждый день: ${source.dailyLimit} видео
Публикация: ${source.publishStartHour}:00–${source.publishEndHour}:00 МСК
Часовой пояс: ${sourceTimeZoneLabel(source)}
Последний запуск: ${source.lastRunAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: sourceTimeZone(source) }).format(source.lastRunAt) : "ещё не запускался"}${source.lastError ? `
Ошибка: ${source.lastError}` : ""}`);
  const keyboard: TelegramReplyMarkup = {
    inline_keyboard: sources.flatMap((source) =>
      runButtons
        ? [[{ text: `▶️ ${source.sourceTitle || source.sourceUrl.slice(0, 24)}`, callback_data: `tg:autosource:run:${source.id}` }]]
        : [[
            { text: "▶️ Запустить", callback_data: `tg:autosource:run:${source.id}` },
            { text: source.isEnabled ? "⏸ Пауза" : "▶️ Включить", callback_data: `tg:autosource:${source.isEnabled ? "pause" : "resume"}:${source.id}` },
            { text: "🗑 Удалить", callback_data: `tg:autosource:delete:${source.id}` },
          ]],
    ),
  };
  return sendTelegramMessage(telegramChatId, `📡 Источники:\n\n${lines.join("\n\n")}`, keyboard);
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
    QUEUED: "в очереди", DOWNLOADING: "скачивание", RENDERING: "рендер", PUBLISHING: "публикация",
    DONE: "готово", FAILED: "ошибка", CANCELED: "отменено", CREATED: "ожидает запуска", PROCESSING: "обрабатывается",
  };
  return names[status] || status.toLowerCase();
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

async function handleMessage(message: NonNullable<TelegramUpdate["message"]>) {
  const chatId = String(message.chat.id);
  const chat = await upsertTelegramChat({ chatId, user: message.from });
  if (!chat.isAllowed) return denied(chatId);
  const text = message.text?.trim() || "";
  const command = text.split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, "");

  if (command === "/start") return sendTelegramMessage(chatId, "🎬 Завод готов. Пришли отдельное VK-видео или ссылку на VK-группу/VK Video канал для ежедневного автозабора.", menu());
  if (command === "/help") return sendTelegramMessage(chatId, "Пришли ссылку на отдельное VK-видео для разовой задачи или ссылку на VK-группу/VK Video канал для ежедневного автозабора.\n\n/status — последние задачи\n/queue — очередь публикаций\n/sources — VK-источники\n/source_status — состояние источников\n/run_today — запустить сегодня\n/pause_sources — остановить источники\n/resume_sources — включить источники");
  if (command === "/status") return showStatus(chat.id, chatId);
  if (command === "/queue") return showQueue(chat.id, chatId);
  if (command === "/sources" || command === "/source_status") return showSources(chat.id, chatId);
  if (command === "/run_today") return showSources(chat.id, chatId, true);
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
      create: { chatId: chat.id, sourceUrl, isEnabled: false },
      update: {},
    });
    if (source.isEnabled) return sendTelegramMessage(chatId, "📡 Этот источник уже добавлен в ежедневный автозабор.");
    return sendTelegramMessage(chatId, `📡 Похоже, это VK-источник.

Добавить его в ежедневный автозабор?

Настройки:
• ${source.dailyLimit} видео в день
• публикация с ${source.publishStartHour}:00 до ${source.publishEndHour}:00 МСК
• часовой пояс: ${sourceTimeZoneLabel(source)}`, autoSourceKeyboard(source.id));
  }

  const sourceUrl = extractVkVideoUrl(text);
  if (!sourceUrl) return sendTelegramMessage(chatId, "Не вижу VK/VKVideo ссылки. Пришли полную ссылку, начинающуюся с https://");
  const telegramJob = await prisma.factoryTelegramJob.create({
    data: { chatId: chat.id, sourceUrl, settings: DEFAULT_SETTINGS },
  });
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
  if (parts[1] === "autosource") {
    const sourceAction = parts[2];
    const sourceId = parts[3];
    const source = sourceId ? await prisma.factoryVkAutoSource.findFirst({ where: { id: sourceId, chatId: chat.id } }) : null;
    if (!source) return answerCallbackQuery(query.id, "Источник не найден");
    const sourceMessageId = callbackMessage!.message_id;

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
    if (sourceAction === "check" || sourceAction === "add") {
      await answerCallbackQuery(query.id, "Проверяю источник…");
      try {
        const videos = await getVkSourceVideos({ sourceUrl: source.sourceUrl, limit: 3 });
        if (sourceAction === "check") return editTelegramMessage(chatId, sourceMessageId, `👀 Источник доступен. Найдено видео: ${videos.length}.`, autoSourceKeyboard(source.id));
        await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: true, lastError: null } });
        return editTelegramMessage(chatId, sourceMessageId, `✅ Источник добавлен.\nСписок видео получаю из публичного VK-раздела.\nСкачивание видео: через vkvideodownload.com.\nКаждый день беру до ${source.dailyLimit} новых видео и публикую с ${source.publishStartHour}:00 до ${source.publishEndHour}:00 МСК.\n\nСейчас найдено: ${videos.length}.`);
      } catch (error) {
        const reason = humanizeFactoryError(error);
        if (sourceAction === "add") {
          await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: true, lastError: reason } });
          return editTelegramMessage(chatId, sourceMessageId, `⚠️ Источник добавлен, но список видео сейчас не прочитался.\nСкачивание отдельных VK-видео через vkvideodownload.com подключено, но для автозабора из группы нужен доступный публичный список видео.\nЯ попробую снова при ежедневном запуске.\n\n${reason}`);
        }
        return editTelegramMessage(chatId, sourceMessageId, `❌ Не получилось прочитать VK-источник.\n${reason}`, autoSourceKeyboard(source.id));
      }
    }
    if (sourceAction === "cancel") {
      if (!source.isEnabled) await prisma.factoryVkAutoSource.delete({ where: { id: source.id } });
      await answerCallbackQuery(query.id, "Отменено");
      return editTelegramMessage(chatId, sourceMessageId, "❌ Добавление автозабора отменено.");
    }
    if (sourceAction === "pause" || sourceAction === "resume") {
      await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: sourceAction === "resume" } });
      await answerCallbackQuery(query.id, sourceAction === "resume" ? "Источник включён" : "Источник на паузе");
      return editTelegramMessage(chatId, sourceMessageId, sourceAction === "resume" ? "▶️ Источник включён." : "⏸ Источник приостановлен.");
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
        return editTelegramMessage(chatId, sourceMessageId, "Сегодня уже запускался. Запустить ещё раз? Новые задачи будут созданы только для ещё не обработанных видео.", { inline_keyboard: [[{ text: "▶️ Запустить ещё раз", callback_data: `tg:autosource:force:${source.id}` }, { text: "❌ Нет", callback_data: `tg:autosource:cancelrun:${source.id}` }]] });
      }
      await answerCallbackQuery(query.id, "Запускаю…");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Manual VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, "📡 Автозабор запущен. Результаты придут отдельными сообщениями.");
    }
    if (sourceAction === "force") {
      await answerCallbackQuery(query.id, "Запускаю повторно…");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Forced VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, "📡 Повторный автозабор запущен. Уже обработанные видео будут пропущены.");
    }
    if (sourceAction === "cancelrun") {
      await answerCallbackQuery(query.id, "Отменено");
      return editTelegramMessage(chatId, sourceMessageId, "Запуск отменён.");
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
    const claimed = await prisma.factoryTelegramJob.updateMany({
      where: { id, factoryJobId: null, status: { not: "CREATING" } },
      data: { status: "CREATING" },
    });
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
