import { prisma } from "../prisma";

export type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
};

type TelegramUser = {
  username?: string;
  first_name?: string;
};

type TelegramChatUpdate = {
  chatId: string | number;
  user?: TelegramUser;
};

type TelegramMessage = { message_id: number };

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  return token;
}

async function callTelegram<T>(method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !data.ok || data.result === undefined) {
    if (method === "editMessageText" && data.description?.includes("message is not modified")) {
      return true as T;
    }
    throw new Error(data.description || `Telegram API: ${response.status}`);
  }
  return data.result;
}

export function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  return callTelegram<TelegramMessage>("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editTelegramMessage(
  chatId: string | number,
  messageId: string | number,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
) {
  return callTelegram<TelegramMessage | true>("editMessageText", {
    chat_id: chatId,
    message_id: Number(messageId),
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}


export async function readTelegramFileText(fileId: string) {
  const file = await callTelegram<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram не отдал путь файла");

  const response = await fetch(`https://api.telegram.org/file/bot${getBotToken()}/${file.file_path}`);
  if (!response.ok) throw new Error(`Telegram file download failed: ${response.status}`);
  return response.text();
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram<true>("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export function isChatAllowed(chatId: string | number) {
  const allowed = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(String(chatId));
}

export async function upsertTelegramChat(update: TelegramChatUpdate) {
  const chatId = String(update.chatId);
  return prisma.factoryTelegramChat.upsert({
    where: { chatId },
    create: {
      chatId,
      username: update.user?.username || null,
      firstName: update.user?.first_name || null,
      isAllowed: isChatAllowed(chatId),
    },
    update: {
      username: update.user?.username || undefined,
      firstName: update.user?.first_name || undefined,
      isAllowed: isChatAllowed(chatId),
    },
  });
}

export function extractVkVideoUrls(text: string) {
  const matches = text.match(/https?:\/\/[^\s<>]+/gi) || [];
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const raw of matches) {
    const cleaned = raw.replace(/[),.!?]+$/, "");
    try {
      const url = new URL(cleaned);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      const path = url.pathname.replace(/\/+$/, "");
      const isVkVideoHost = host === "vkvideo.ru" || host.endsWith(".vkvideo.ru");
      const isVkHost = ["vk.com", "vk.ru", "m.vk.com", "m.vk.ru"].includes(host);
      const isSingleVideo = /^\/video-?\d+_\d+/i.test(path) || (path === "/video" && /video-?\d+_\d+/i.test(url.search));

      if ((isVkVideoHost && isSingleVideo) || (isVkHost && isSingleVideo)) {
        const normalized = url.toString();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          urls.push(normalized);
        }
      }
    } catch {
      // Не URL — продолжаем искать следующую ссылку.
    }
  }

  return urls;
}

export function extractVkVideoUrl(text: string) {
  return extractVkVideoUrls(text)[0] || null;
}

export function humanizeFactoryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("vkvideodownload.com")) return message.trim();
  if (lower.includes("database_url")) return "не настроен DATABASE_URL";
  if (lower.includes("r2") && (lower.includes("not") || lower.includes("не "))) return "R2 не настроен";
  if (lower.includes("youtube") && (lower.includes("token") || lower.includes("oauth"))) return "истёк YouTube OAuth-токен";
  if (lower.includes("youtube") && (lower.includes("account") || lower.includes("аккаунт"))) return "нет доступного YouTube-аккаунта";
  if (lower.includes("720") || (lower.includes("vk") && lower.includes("mp4"))) return "VK не отдал MP4 720p со звуком";
  if (lower.includes("yt-dlp")) return "yt-dlp не смог получить список или скачать видео";
  if (lower.includes("ffmpeg")) return "ошибка ffmpeg";
  if (lower.includes("vk") && (lower.includes("http") || lower.includes("не открывается"))) return "VK источник не открывается";
  if (lower.includes("vk") && lower.includes("список")) return "VK не отдал список видео";
  return message.trim() || "неизвестная ошибка";
}

export async function notifyTelegramJob(factoryJobId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    const telegramJob = await prisma.factoryTelegramJob.findFirst({
      where: { factoryJobId },
      include: { chat: { select: { chatId: true } } },
    });
    if (!telegramJob || telegramJob.lastStatusText === text) return;
    await sendTelegramMessage(telegramJob.chat.chatId, text);
    await prisma.factoryTelegramJob.update({
      where: { id: telegramJob.id },
      data: { lastStatusText: text, status: "PROCESSING" },
    });
  } catch (error) {
    console.error("Telegram notification failed:", error);
  }
}
