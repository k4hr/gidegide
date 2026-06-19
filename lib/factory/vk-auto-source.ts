import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createVkMovieJob } from "@/lib/factory/create-vk-movie-job";
import { humanizeFactoryError, isChatAllowed, sendTelegramMessage } from "@/lib/factory/telegram";
import { runCommand } from "@/lib/factory/video";
import { getPublicVkSourceVideos } from "@/lib/factory/vk-super-upload";

export type VkSourceVideo = {
  providerVideoId?: string;
  videoUrl: string;
  title?: string;
  durationSec?: number;
  publishedAt?: Date;
  thumbnailUrl?: string;
};

const VK_API_VERSION = "5.199";

export const DEFAULT_VK_AUTO_SOURCE_TIMEZONE = "Europe/Moscow";
export const LEGACY_VK_AUTO_SOURCE_TIMEZONE = "Europe/Moscow";

export function normalizeVkAutoSourceTimezone(timezone?: string | null) {
  const value = timezone?.trim();
  if (!value || value === LEGACY_VK_AUTO_SOURCE_TIMEZONE) return DEFAULT_VK_AUTO_SOURCE_TIMEZONE;
  return value;
}

export function vkAutoSourceTimezoneLabel(timezone?: string | null) {
  const normalized = normalizeVkAutoSourceTimezone(timezone);
  return normalized === DEFAULT_VK_AUTO_SOURCE_TIMEZONE ? "РњРЎРљ (Europe/Moscow)" : normalized;
}

  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour === 24 ? 0 : parts.hour, minute: parts.minute };
}

export function getSourceRunDate(timezone: string, date = new Date()) {
  const parts = localParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateInTimezone(runDate: string, hour: number, minute: number, timezone: string) {
  const [year, month, day] = runDate.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const represented = localParts(guess, timezone);
  const offset = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function nextRunAt(runDate: string, timezone: string) {
  const [year, month, day] = runDate.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12));
  const nextDate = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, "0")}-${String(tomorrow.getUTCDate()).padStart(2, "0")}`;
  const scanHour = Math.max(0, Math.min(23, Number(process.env.FACTORY_VK_AUTO_SOURCE_SCAN_HOUR || 13)));
  return dateInTimezone(nextDate, scanHour, 0, timezone);
}

export async function notifyVkAutoSource(sourceId: string, text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id: sourceId }, include: { chat: { select: { chatId: true, isAllowed: true } } } });
  if (source?.chat.isAllowed && isChatAllowed(source.chat.chatId)) await sendTelegramMessage(source.chat.chatId, text).catch((error) => console.error("VK auto-source Telegram notification failed:", error));
}

export async function notifyVkAutoSourceRun(runId: string, text: string) {
  const run = await prisma.factoryVkAutoSourceRun.findUnique({ where: { id: runId }, select: { sourceId: true } });
  if (run) await notifyVkAutoSource(run.sourceId, text);
}

export async function runVkAutoSourceDaily(sourceId: string, options: { force?: boolean } = {}) {
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id: sourceId }, include: { chat: true } });
  if (!source) throw new Error("VK РёСЃС‚РѕС‡РЅРёРє РЅРµ РЅР°Р№РґРµРЅ");
  const sourceTimezone = normalizeVkAutoSourceTimezone(source.timezone);
  if (source.timezone !== sourceTimezone) {
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { timezone: sourceTimezone } });
  }
  if (!source.chat.isAllowed || !isChatAllowed(source.chat.chatId)) throw new Error("РђРІС‚РѕР·Р°Р±РѕСЂ РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ СЂР°Р·СЂРµС€С‘РЅРЅС‹Рј chatId");
  if (!source.isEnabled && !options.force) return null;
  const today = getSourceRunDate(sourceTimezone);
  const runDate = options.force ? `${today}#${Date.now()}` : today;
  let run;
  try {
    run = await prisma.factoryVkAutoSourceRun.create({ data: { sourceId, runDate } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }

  await notifyVkAutoSourceRun(run.id, `рџ“Ў РђРІС‚РѕР·Р°Р±РѕСЂ Р·Р°РїСѓС‰РµРЅ: ${source.sourceTitle || source.sourceUrl}\nРС‰Сѓ РґРѕ ${source.dailyLimit} РЅРѕРІС‹С… РІРёРґРµРѕ.`);
  try {
    const fetched = await getVkSourceVideos({ sourceUrl: source.sourceUrl, limit: 50 });
    let foundCount = 0;
    for (const video of fetched) {
      const globalDuplicate = await prisma.factoryVkAutoSourceVideo.findFirst({
        where: { OR: [{ videoUrl: video.videoUrl }, ...(video.providerVideoId ? [{ providerVideoId: video.providerVideoId }] : [])] },
        select: { sourceId: true },
      });
      if (globalDuplicate && globalDuplicate.sourceId !== source.id) continue;
      const existing = await prisma.factoryVkAutoSourceVideo.findUnique({ where: { sourceId_videoUrl: { sourceId: source.id, videoUrl: video.videoUrl } } });
      if (!existing) {
        await prisma.factoryVkAutoSourceVideo.create({ data: { sourceId: source.id, providerVideoId: video.providerVideoId, videoUrl: video.videoUrl, title: video.title, durationSec: video.durationSec ? Math.round(video.durationSec) : null, publishedAt: video.publishedAt, thumbnailUrl: video.thumbnailUrl } });
        foundCount += 1;
      }
    }

    const picked = await prisma.factoryVkAutoSourceVideo.findMany({
      where: { sourceId: source.id, status: "NEW", factoryJobId: null },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: source.dailyLimit,
    });
    const intervalMinutes = Math.floor(((source.publishEndHour - source.publishStartHour) * 60) / Math.max(picked.length - 1, 1));
    let created = 0;
    let failed = 0;
    for (let index = 0; index < picked.length; index += 1) {
      const video = picked[index];
      const totalMinutes = source.publishStartHour * 60 + intervalMinutes * index;
      const scheduledAt = dateInTimezone(today, Math.floor(totalMinutes / 60), totalMinutes % 60, sourceTimezone);
      try {
        const claimed = await prisma.factoryVkAutoSourceVideo.updateMany({ where: { id: video.id, status: "NEW", factoryJobId: null }, data: { status: "PROCESSING", pickedAt: new Date(), error: null } });
        if (!claimed.count) continue;
        const clipSeconds = Math.max(15, Math.min(60, video.durationSec || 60));
        const job = await createVkMovieJob({ sourceUrl: video.videoUrl, movieTitle: video.title || "VK РІРёРґРµРѕ", clipCount: 1, clipSeconds, scheduleMode: "NOW", scheduleStartHour: source.publishStartHour, scheduleEndHour: source.publishEndHour, scheduleIntervalMinutes: intervalMinutes || 60, timeZone: sourceTimezone, scheduledAt });
        await prisma.factoryVkAutoSourceVideo.update({ where: { id: video.id }, data: { status: "QUEUED", factoryJobId: job.id } });
        created += 1;
      } catch (error) {
        failed += 1;
        await prisma.factoryVkAutoSourceVideo.update({ where: { id: video.id }, data: { status: "FAILED", error: humanizeVkAutoSourceError(error) } });
      }
    }

    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: created ? "JOBS_CREATED" : "DONE", foundCount, pickedCount: picked.length, createdJobCount: created, failedCount: failed, ...(created ? {} : { finishedAt: new Date() }) } });
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastRunDate: today, lastRunAt: new Date(), nextRunAt: nextRunAt(today, sourceTimezone), lastError: null } });
    await notifyVkAutoSourceRun(run.id, `вњ… РќР°Р№РґРµРЅРѕ Рё РІР·СЏС‚Рѕ РІ СЂР°Р±РѕС‚Сѓ: ${created} РІРёРґРµРѕ.\nРЎРѕР·РґР°РЅРѕ Р·Р°РґР°С‡: ${created}.\nРџСѓР±Р»РёРєР°С†РёСЏ: ${source.publishStartHour}:00вЂ“${source.publishEndHour}:00.${failed ? `\nРћС€РёР±РѕРє СЃРѕР·РґР°РЅРёСЏ: ${failed}.` : ""}`);
    if (!created) await notifyVkAutoSourceRun(run.id, `рџЏЃ РђРІС‚РѕР·Р°Р±РѕСЂ Р·Р°РІРµСЂС€С‘РЅ.\nРСЃС‚РѕС‡РЅРёРє: ${source.sourceTitle || source.sourceUrl}\nРЎРѕР·РґР°РЅРѕ Р·Р°РґР°С‡: 0\nРћРїСѓР±Р»РёРєРѕРІР°РЅРѕ: 0\nРћС€РёР±РѕРє: ${failed}`);
    return run;
  } catch (error) {
    const reason = humanizeVkAutoSourceError(error);
    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: "FAILED", error: reason, failedCount: 1, finishedAt: new Date() } });
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastRunDate: today, lastRunAt: new Date(), nextRunAt: nextRunAt(today, sourceTimezone), lastError: reason } });
    await notifyVkAutoSourceRun(run.id, `вќЊ РћС€РёР±РєР° Р°РІС‚РѕР·Р°Р±РѕСЂР° VK:\nРСЃС‚РѕС‡РЅРёРє: ${source.sourceTitle || source.sourceUrl}\nРџСЂРёС‡РёРЅР°: ${reason}`);
    throw error;
  }
}

export async function processDueVkAutoSources(now = new Date()) {
  if (process.env.FACTORY_VK_AUTO_SOURCES_ENABLED?.toLowerCase() !== "true") return 0;
  const scanHour = Math.max(0, Math.min(23, Number(process.env.FACTORY_VK_AUTO_SOURCE_SCAN_HOUR || 13)));
  const sources = await prisma.factoryVkAutoSource.findMany({ where: { isEnabled: true, chat: { isAllowed: true } } });
  let started = 0;
  for (const source of sources) {
    const sourceTimezone = normalizeVkAutoSourceTimezone(source.timezone);
    if (source.timezone !== sourceTimezone) {
      await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { timezone: sourceTimezone } });
    }
    const parts = localParts(now, sourceTimezone);
    const today = getSourceRunDate(sourceTimezone, now);
    if (source.lastRunDate === today || parts.hour < scanHour || parts.hour >= source.publishEndHour) continue;
    const run = await runVkAutoSourceDaily(source.id).catch((error) => { console.error("VK auto-source run failed:", error); return null; });
    if (run) started += 1;
  }
  return started;
}

async function queueReplacementVideo(input: {
  source: {
    id: string;
    dailyLimit: number;
    publishStartHour: number;
    publishEndHour: number;
    timezone: string;
  };
  run: {
    id: string;
    startedAt: Date;
    createdJobCount: number;
  };
}) {
  const sourceTimezone = normalizeVkAutoSourceTimezone(input.source.timezone);
      scheduledAt: new Date(),
    });
    await prisma.$transaction([
      prisma.factoryVkAutoSourceVideo.update({ where: { id: replacement.id }, data: { status: "QUEUED", factoryJobId: job.id } }),
      prisma.factoryVkAutoSourceRun.update({ where: { id: input.run.id }, data: { pickedCount: { increment: 1 }, createdJobCount: { increment: 1 } } }),
    ]);
    await notifyVkAutoSourceRun(input.run.id, `рџ”„ Р’РјРµСЃС‚Рѕ РЅРµСѓРґР°С‡РЅРѕРіРѕ РІРёРґРµРѕ РІР·СЏС‚Рѕ СЃР»РµРґСѓСЋС‰РµРµ: ${replacement.title || replacement.videoUrl}`);
    return true;
  } catch (error) {
    await prisma.$transaction([
      prisma.factoryVkAutoSourceVideo.update({ where: { id: replacement.id }, data: { status: "FAILED", error: humanizeVkAutoSourceError(error) } }),
      prisma.factoryVkAutoSourceRun.update({ where: { id: input.run.id }, data: { pickedCount: { increment: 1 }, failedCount: { increment: 1 } } }),
    ]);
    return false;
  }
}

export async function updateVkAutoSourceVideoFromJob(factoryJobId: string, result: { status: "PUBLISHED" | "FAILED"; url?: string; error?: unknown }) {
  const video = await prisma.factoryVkAutoSourceVideo.findFirst({ where: { factoryJobId }, include: { source: true } });
  if (!video) return;
  const error = result.status === "FAILED" ? humanizeVkAutoSourceError(result.error) : null;
  await prisma.factoryVkAutoSourceVideo.update({ where: { id: video.id }, data: { status: result.status, publishedUrl: result.url || null, error } });
  let run = await prisma.factoryVkAutoSourceRun.findFirst({ where: { sourceId: video.sourceId, status: "JOBS_CREATED", startedAt: { lte: video.pickedAt || new Date() } }, orderBy: { startedAt: "desc" } });
  if (!run) return;
  if (result.status === "FAILED") {
    await queueReplacementVideo({ source: video.source, run });
    run = await prisma.factoryVkAutoSourceRun.findUnique({ where: { id: run.id } });
    if (!run) return;
  }
  const runVideos = await prisma.factoryVkAutoSourceVideo.findMany({ where: { sourceId: video.sourceId, factoryJobId: { not: null }, pickedAt: { gte: run.startedAt } }, select: { status: true } });
  const publishedCount = runVideos.filter((item) => item.status === "PUBLISHED").length;
  const failedJobs = runVideos.filter((item) => item.status === "FAILED").length;
  const failedCount = Math.max(0, run.pickedCount - run.createdJobCount) + failedJobs;
  await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { publishedCount, failedCount } });
  if (result.status === "PUBLISHED") await notifyVkAutoSourceRun(run.id, `вњ… РћРїСѓР±Р»РёРєРѕРІР°РЅРѕ ${publishedCount}/${run.createdJobCount}: ${result.url}`);
  const terminal = publishedCount + failedJobs;
  if (terminal >= run.createdJobCount) {
    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: failedCount ? "DONE_WITH_ERRORS" : "DONE", finishedAt: new Date() } });
    await notifyVkAutoSourceRun(run.id, `рџЏЃ РђРІС‚РѕР·Р°Р±РѕСЂ Р·Р°РІРµСЂС€С‘РЅ.\nРСЃС‚РѕС‡РЅРёРє: ${video.source.sourceTitle || video.source.sourceUrl}\nРЎРѕР·РґР°РЅРѕ Р·Р°РґР°С‡: ${run.createdJobCount}\nРћРїСѓР±Р»РёРєРѕРІР°РЅРѕ: ${publishedCount}\nРћС€РёР±РѕРє: ${failedCount}`);
  }
}
