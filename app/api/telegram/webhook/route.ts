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

    ],
    [{ text: "вњ… Р”РѕР±Р°РІРёС‚СЊ", callback_data: `tg:autosource:add:${id}` }],
  ] };
}

async function showSources(chatDbId: string, telegramChatId: string, runButtons = false) {
  await prisma.factoryVkAutoSource.updateMany({
    where: { chatId: chatDbId, timezone: "Europe/Moscow" },
    data: { timezone: DEFAULT_VK_AUTO_SOURCE_TIMEZONE },
  });
  const sources = await prisma.factoryVkAutoSource.findMany({ where: { chatId: chatDbId }, orderBy: { createdAt: "asc" } });
  if (!sources.length) return sendTelegramMessage(telegramChatId, "рџ“Ў РСЃС‚РѕС‡РЅРёРєРѕРІ РїРѕРєР° РЅРµС‚. РџСЂРёС€Р»Рё СЃСЃС‹Р»РєСѓ РЅР° VK-РіСЂСѓРїРїСѓ РёР»Рё VK Video РєР°РЅР°Р».");
  const lines = sources.map((source, index) => `${index + 1}. ${source.sourceTitle || source.sourceUrl}\nРЎС‚Р°С‚СѓСЃ: ${source.isEnabled ? "РІРєР»СЋС‡С‘РЅ" : "РїР°СѓР·Р°"}\nРљР°Р¶РґС‹Р№ РґРµРЅСЊ: ${source.dailyLimit} РІРёРґРµРѕ\nРџСѓР±Р»РёРєР°С†РёСЏ: ${source.publishStartHour}:00вЂ“${source.publishEndHour}:00 РњРЎРљ\nР§Р°СЃРѕРІРѕР№ РїРѕСЏСЃ: ${sourceTimeZoneLabel(source)}\nРџРѕСЃР»РµРґРЅРёР№ Р·Р°РїСѓСЃРє: ${source.lastRunAt ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: sourceTimeZone(source) }).format(source.lastRunAt) : "РµС‰С‘ РЅРµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ"}${source.lastError ? `\nРћС€РёР±РєР°: ${source.lastError}` : ""}`);
  const keyboard: TelegramReplyMarkup = {
    inline_keyboard: sources.flatMap((source) =>
      runButtons
        ? [[{ text: `в–¶пёЏ ${source.sourceTitle || source.sourceUrl.slice(0, 24)}`, callback_data: `tg:autosource:run:${source.id}` }]]
        : [[
            { text: "в–¶пёЏ Р—Р°РїСѓСЃС‚РёС‚СЊ", callback_data: `tg:autosource:run:${source.id}` },
            { text: source.isEnabled ? "вЏё РџР°СѓР·Р°" : "в–¶пёЏ Р’РєР»СЋС‡РёС‚СЊ", callback_data: `tg:autosource:${source.isEnabled ? "pause" : "resume"}:${source.id}` },
            { text: "рџ—‘ РЈРґР°Р»РёС‚СЊ", callback_data: `tg:autosource:delete:${source.id}` },
          ]],
    ),
  };
  return sendTelegramMessage(telegramChatId, `рџ“Ў РСЃС‚РѕС‡РЅРёРєРё:\n\n${lines.join("\n\n")}`, keyboard);
}


  const sourceUrl = extractVkVideoUrl(text);
  if (!sourceUrl) return sendTelegramMessage(chatId, "РќРµ РІРёР¶Сѓ VK/VKVideo СЃСЃС‹Р»РєРё. РџСЂРёС€Р»Рё РїРѕР»РЅСѓСЋ СЃСЃС‹Р»РєСѓ, РЅР°С‡РёРЅР°СЋС‰СѓСЋСЃСЏ СЃ https://");
  const telegramJob = await prisma.factoryTelegramJob.create({
    data: { chatId: chat.id, sourceUrl, settings: DEFAULT_SETTINGS },
  });
  const sent = await sendTelegramMessage(chatId, "рџЋ¬ Р’РёРґРµРѕ РїРѕР»СѓС‡РµРЅРѕ.\nРЎРєР°С‡РёРІР°РЅРёРµ Р±СѓРґРµС‚ С‡РµСЂРµР· vkvideodownload.com.\n\nР§С‚Рѕ РґРµР»Р°РµРј?", previewKeyboard(telegramJob.id));
  await prisma.factoryTelegramJob.update({ where: { id: telegramJob.id }, data: { telegramMessageId: String(sent.message_id) } });
}

async function handleCallback(query: NonNullable<TelegramUpdate["callback_query"]>) {
  const callbackMessage = query.message;
  const chatId = callbackMessage ? String(callbackMessage.chat.id) : "";
  if (!chatId || !query.data) return answerCallbackQuery(query.id, "РЎРѕРѕР±С‰РµРЅРёРµ СѓСЃС‚Р°СЂРµР»Рѕ");
  const chat = await upsertTelegramChat({ chatId, user: query.from });
  if (!chat.isAllowed) {
    await answerCallbackQuery(query.id, "Р”РѕСЃС‚СѓРї РЅРµ РІС‹РґР°РЅ");
    return denied(chatId);
  }

  const parts = query.data.split(":");
  if (parts[1] === "autosource") {
    const sourceAction = parts[2];
    const sourceId = parts[3];
    const source = sourceId ? await prisma.factoryVkAutoSource.findFirst({ where: { id: sourceId, chatId: chat.id } }) : null;
    if (!source) return answerCallbackQuery(query.id, "РСЃС‚РѕС‡РЅРёРє РЅРµ РЅР°Р№РґРµРЅ");
    const sourceMessageId = callbackMessage!.message_id;

    if (sourceAction === "settings") {
      await answerCallbackQuery(query.id);
      return editTelegramMessage(chatId, sourceMessageId, `вљ™пёЏ РќР°СЃС‚СЂРѕР№РєРё Р°РІС‚РѕР·Р°Р±РѕСЂР°\n\nР’РёРґРµРѕ РІ РґРµРЅСЊ: ${source.dailyLimit}\nРћРєРЅРѕ: ${source.publishStartHour}:00вЂ“${source.publishEndHour}:00 РњРЎРљ\nР§Р°СЃРѕРІРѕР№ РїРѕСЏСЃ: ${sourceTimeZoneLabel(source)}`, autoSourceSettingsKeyboard(source.id));
    }
    if (sourceAction === "set") {
      const key = parts[4];
      const value = Number(parts[5]);
      const data = key === "limit" && [5, 10, 20].includes(value)
        ? { dailyLimit: value }
        : key === "window" && [15, 18].includes(value)
          ? { publishStartHour: value, publishEndHour: 23 }
          : null;
      if (!data) return answerCallbackQuery(query.id, "РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РЅР°СЃС‚СЂРѕР№РєР°");
      const updated = await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data });
      await answerCallbackQuery(query.id, "РЎРѕС…СЂР°РЅРµРЅРѕ");
      return editTelegramMessage(chatId, sourceMessageId, `вљ™пёЏ РќР°СЃС‚СЂРѕР№РєРё Р°РІС‚РѕР·Р°Р±РѕСЂР°\n\nР’РёРґРµРѕ РІ РґРµРЅСЊ: ${updated.dailyLimit}\nРћРєРЅРѕ: ${updated.publishStartHour}:00вЂ“${updated.publishEndHour}:00 РњРЎРљ\nР§Р°СЃРѕРІРѕР№ РїРѕСЏСЃ: ${sourceTimeZoneLabel(updated)}`, autoSourceSettingsKeyboard(source.id));
    }
    if (sourceAction === "check" || sourceAction === "add") {
      await answerCallbackQuery(query.id, "РџСЂРѕРІРµСЂСЏСЋ РёСЃС‚РѕС‡РЅРёРєвЂ¦");
      try {
        const videos = await getVkSourceVideos({ sourceUrl: source.sourceUrl, limit: 3 });
        if (sourceAction === "check") return editTelegramMessage(chatId, sourceMessageId, `рџ‘Ђ РСЃС‚РѕС‡РЅРёРє РґРѕСЃС‚СѓРїРµРЅ. РќР°Р№РґРµРЅРѕ РІРёРґРµРѕ: ${videos.length}.`, autoSourceKeyboard(source.id));
        await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: true, lastError: null } });
        return editTelegramMessage(chatId, sourceMessageId, `вњ… РСЃС‚РѕС‡РЅРёРє РґРѕР±Р°РІР»РµРЅ.\nРЎРїРёСЃРѕРє РІРёРґРµРѕ РїРѕР»СѓС‡Р°СЋ РёР· РїСѓР±Р»РёС‡РЅРѕРіРѕ VK-СЂР°Р·РґРµР»Р°.\nРЎРєР°С‡РёРІР°РЅРёРµ РІРёРґРµРѕ: С‡РµСЂРµР· vkvideodownload.com.\nРљР°Р¶РґС‹Р№ РґРµРЅСЊ Р±РµСЂСѓ РґРѕ ${source.dailyLimit} РЅРѕРІС‹С… РІРёРґРµРѕ Рё РїСѓР±Р»РёРєСѓСЋ СЃ ${source.publishStartHour}:00 РґРѕ ${source.publishEndHour}:00 РїРѕ РњРЎРљ.\nР§Р°СЃРѕРІРѕР№ РїРѕСЏСЃ: ${sourceTimeZoneLabel(source)}.\n\nРЎРµР№С‡Р°СЃ РЅР°Р№РґРµРЅРѕ: ${videos.length}.`);
      } catch (error) {
        const reason = humanizeFactoryError(error);
        if (sourceAction === "add") {
          await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: true, lastError: reason } });
          return editTelegramMessage(chatId, sourceMessageId, `вљ пёЏ РСЃС‚РѕС‡РЅРёРє РґРѕР±Р°РІР»РµРЅ, РЅРѕ СЃРїРёСЃРѕРє РІРёРґРµРѕ СЃРµР№С‡Р°СЃ РЅРµ РїСЂРѕС‡РёС‚Р°Р»СЃСЏ.\nРЎРєР°С‡РёРІР°РЅРёРµ РѕС‚РґРµР»СЊРЅС‹С… VK-РІРёРґРµРѕ С‡РµСЂРµР· vkvideodownload.com РїРѕРґРєР»СЋС‡РµРЅРѕ, РЅРѕ РґР»СЏ Р°РІС‚РѕР·Р°Р±РѕСЂР° РёР· РіСЂСѓРїРїС‹ РЅСѓР¶РµРЅ РґРѕСЃС‚СѓРїРЅС‹Р№ РїСѓР±Р»РёС‡РЅС‹Р№ СЃРїРёСЃРѕРє РІРёРґРµРѕ.\nРЇ РїРѕРїСЂРѕР±СѓСЋ СЃРЅРѕРІР° РїСЂРё РµР¶РµРґРЅРµРІРЅРѕРј Р·Р°РїСѓСЃРєРµ.\n\n${reason}`);
        }
        return editTelegramMessage(chatId, sourceMessageId, `вќЊ РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ VK-РёСЃС‚РѕС‡РЅРёРє.\n${reason}`, autoSourceKeyboard(source.id));
      }
    }
    if (sourceAction === "cancel") {
      if (!source.isEnabled) await prisma.factoryVkAutoSource.delete({ where: { id: source.id } });
      await answerCallbackQuery(query.id, "РћС‚РјРµРЅРµРЅРѕ");
      return editTelegramMessage(chatId, sourceMessageId, "вќЊ Р”РѕР±Р°РІР»РµРЅРёРµ Р°РІС‚РѕР·Р°Р±РѕСЂР° РѕС‚РјРµРЅРµРЅРѕ.");
    }
    if (sourceAction === "pause" || sourceAction === "resume") {
      await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { isEnabled: sourceAction === "resume" } });
      await answerCallbackQuery(query.id, sourceAction === "resume" ? "РСЃС‚РѕС‡РЅРёРє РІРєР»СЋС‡С‘РЅ" : "РСЃС‚РѕС‡РЅРёРє РЅР° РїР°СѓР·Рµ");
      return editTelegramMessage(chatId, sourceMessageId, sourceAction === "resume" ? "в–¶пёЏ РСЃС‚РѕС‡РЅРёРє РІРєР»СЋС‡С‘РЅ." : "вЏё РСЃС‚РѕС‡РЅРёРє РїСЂРёРѕСЃС‚Р°РЅРѕРІР»РµРЅ.");
    }
    if (sourceAction === "delete") {
      await prisma.factoryVkAutoSource.delete({ where: { id: source.id } });
      await answerCallbackQuery(query.id, "РЈРґР°Р»РµРЅРѕ");
      return editTelegramMessage(chatId, sourceMessageId, "рџ—‘ РСЃС‚РѕС‡РЅРёРє СѓРґР°Р»С‘РЅ.");
    }
    if (sourceAction === "run") {
      const today = getSourceRunDate(sourceTimeZone(source));
      if (source.lastRunDate === today) {
        await answerCallbackQuery(query.id, "РЎРµРіРѕРґРЅСЏ СѓР¶Рµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ");
        return editTelegramMessage(chatId, sourceMessageId, "РЎРµРіРѕРґРЅСЏ СѓР¶Рµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ. Р—Р°РїСѓСЃС‚РёС‚СЊ РµС‰С‘ СЂР°Р·? РќРѕРІС‹Рµ Р·Р°РґР°С‡Рё Р±СѓРґСѓС‚ СЃРѕР·РґР°РЅС‹ С‚РѕР»СЊРєРѕ РґР»СЏ РµС‰С‘ РЅРµ РѕР±СЂР°Р±РѕС‚Р°РЅРЅС‹С… РІРёРґРµРѕ.", { inline_keyboard: [[{ text: "в–¶пёЏ Р—Р°РїСѓСЃС‚РёС‚СЊ РµС‰С‘ СЂР°Р·", callback_data: `tg:autosource:force:${source.id}` }, { text: "вќЊ РќРµС‚", callback_data: `tg:autosource:cancelrun:${source.id}` }]] });
      }
      await answerCallbackQuery(query.id, "Р—Р°РїСѓСЃРєР°СЋвЂ¦");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Manual VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, "рџ“Ў РђРІС‚РѕР·Р°Р±РѕСЂ Р·Р°РїСѓС‰РµРЅ. Р РµР·СѓР»СЊС‚Р°С‚С‹ РїСЂРёРґСѓС‚ РѕС‚РґРµР»СЊРЅС‹РјРё СЃРѕРѕР±С‰РµРЅРёСЏРјРё.");
    }
    if (sourceAction === "force") {
      await answerCallbackQuery(query.id, "Р—Р°РїСѓСЃРєР°СЋ РїРѕРІС‚РѕСЂРЅРѕвЂ¦");
      void runVkAutoSourceDaily(source.id, { force: true }).catch((error) => console.error("Forced VK auto-source run failed:", error));
      return editTelegramMessage(chatId, sourceMessageId, "рџ“Ў РџРѕРІС‚РѕСЂРЅС‹Р№ Р°РІС‚РѕР·Р°Р±РѕСЂ Р·Р°РїСѓС‰РµРЅ. РЈР¶Рµ РѕР±СЂР°Р±РѕС‚Р°РЅРЅС‹Рµ РІРёРґРµРѕ Р±СѓРґСѓС‚ РїСЂРѕРїСѓС‰РµРЅС‹.");
    }
    if (sourceAction === "cancelrun") {
      await answerCallbackQuery(query.id, "РћС‚РјРµРЅРµРЅРѕ");
      return editTelegramMessage(chatId, sourceMessageId, "Р—Р°РїСѓСЃРє РѕС‚РјРµРЅС‘РЅ.");
    }
    return answerCallbackQuery(query.id, "РќРµРёР·РІРµСЃС‚РЅР°СЏ РєРѕРјР°РЅРґР° РёСЃС‚РѕС‡РЅРёРєР°");
  }
  const action = parts[1];
  const id = parts[2];
  const telegramJob = id
    ? await prisma.factoryTelegramJob.findFirst({ where: { id, chatId: chat.id }, include: { factoryJob: true } })
    : null;
  if (!telegramJob) return answerCallbackQuery(query.id, "Р—Р°РґР°С‡Р° РЅРµ РЅР°Р№РґРµРЅР°");
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
    await answerCallbackQuery(query.id, "РЎРѕС…СЂР°РЅРµРЅРѕ");
    return editTelegramMessage(chatId, messageId, settingsText(settings), settingsKeyboard(id));
  }
  if (action === "check") {
    await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "CHECKED" } });
    await answerCallbackQuery(query.id, "РЎСЃС‹Р»РєР° РїСЂРёРЅСЏС‚Р°");
    return editTelegramMessage(chatId, messageId, "рџ‘Ђ РЎСЃС‹Р»РєР° РїРѕС…РѕР¶Р° РЅР° РєРѕСЂСЂРµРєС‚РЅСѓСЋ VK/VKVideo СЃСЃС‹Р»РєСѓ. Р—Р°РґР°С‡Р° РЅРµ Р·Р°РїСѓСЃРєР°Р»Р°СЃСЊ.", previewKeyboard(id));
  }
  if (action === "cancel") {
    if (telegramJob.factoryJobId) await cancelFactoryJob(telegramJob.factoryJobId);
    await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "CANCELED", lastStatusText: "рџ›‘ Р—Р°РґР°С‡Р° РѕС‚РјРµРЅРµРЅР°." } });
    await answerCallbackQuery(query.id, "РћС‚РјРµРЅРµРЅРѕ");
    return editTelegramMessage(chatId, messageId, "рџ›‘ Р—Р°РґР°С‡Р° РѕС‚РјРµРЅРµРЅР°.");
  }
  if (action === "auto") {
    if (telegramJob.factoryJobId) return answerCallbackQuery(query.id, "Р—Р°РґР°С‡Р° СѓР¶Рµ СЃРѕР·РґР°РЅР°");
    const claimed = await prisma.factoryTelegramJob.updateMany({
      where: { id, factoryJobId: null, status: { not: "CREATING" } },
      data: { status: "CREATING" },
    });
    if (claimed.count === 0) return answerCallbackQuery(query.id, "Р—Р°РґР°С‡Р° СѓР¶Рµ СЃРѕР·РґР°С‘С‚СЃСЏ");
    await answerCallbackQuery(query.id, "РЎРѕР·РґР°СЋ Р·Р°РґР°С‡СѓвЂ¦");
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
      const keyboard: TelegramReplyMarkup = { inline_keyboard: [[...(site ? [{ text: "РћС‚РєСЂС‹С‚СЊ СЃР°Р№С‚", url: site }] : []), { text: "РћС‚РјРµРЅРёС‚СЊ", callback_data: `tg:cancel:${id}` }]] };
      return editTelegramMessage(chatId, messageId, `вњ… Р—Р°РґР°С‡Р° СЃРѕР·РґР°РЅР°: #${job.id}\nрџЋ¬ ${settings.clips} СЂРѕР»РёРєРѕРІ РїРѕ ${settings.seconds} СЃРµРєСѓРЅРґ\nвЏ° РџСѓР±Р»РёРєР°С†РёСЏ: ${settings.start}:00вЂ“${settings.end}:00, СЂР°Р· РІ ${settings.interval === 60 ? "С‡Р°СЃ" : `${settings.interval} РјРёРЅ`}`, keyboard);
    } catch (error) {
      const reason = humanizeFactoryError(error);
      await prisma.factoryTelegramJob.update({ where: { id }, data: { status: "FAILED", lastStatusText: `вќЊ РћС€РёР±РєР°: ${reason}` } });
      return editTelegramMessage(chatId, messageId, `вќЊ РћС€РёР±РєР°: ${reason}`, previewKeyboard(id));
    }
  }
  return answerCallbackQuery(query.id, "РќРµРёР·РІРµСЃС‚РЅР°СЏ РєРѕРјР°РЅРґР°");
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
