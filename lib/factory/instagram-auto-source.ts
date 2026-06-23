import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FactoryInstagramAutoSource } from "@prisma/client";

import { prisma } from "../prisma";
import { FACTORY_SOURCE_DIR } from "./paths";
import { withDbRetry } from "./db-retry";
import { safeFileName } from "./video";
import { INSTAGRAM_AUTO_SOURCE_CONFIG } from "./instagram-auto-source-config";
import {
  listInstagramPublicVideos,
  downloadInstagramPublicVideo,
  normalizeInstagramSourceUrl,
  extractInstagramSourceUrls,
  type InstagramPublicVideo,
} from "./providers/instagram-public-provider";

export const INSTAGRAM_REDFILM_PHRASE = "переходи смотреть на REDFILM";

function db<T>(operation: () => Promise<T>) {
  return withDbRetry(operation, 5);
}

function dateKey(date = new Date(), timeZone = INSTAGRAM_AUTO_SOURCE_CONFIG.timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
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
  const representedAsUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
    represented.second,
  );
  return new Date(utcGuess.getTime() - (representedAsUtc - utcGuess.getTime()));
}

function scheduledSlots(input: {
  count: number;
  startHour: number;
  endHour: number;
  timeZone: string;
  date?: Date;
  startFromNow?: boolean;
}) {
  const count = Math.max(1, input.count);
  const now = input.date ?? new Date();
  const parts = timeZoneParts(now, input.timeZone);
  const configuredStart = Math.max(0, Math.min(23, input.startHour));
  const normalizedEndHour = input.endHour >= 24 ? 24 : Math.max(0, Math.min(23, input.endHour));
  const nowMinuteOfDay = parts.hour * 60 + parts.minute;
  const startMinute = input.startFromNow ? nowMinuteOfDay + 3 : configuredStart * 60;

  let endMinute = normalizedEndHour === 24 ? 24 * 60 : normalizedEndHour * 60;
  if (input.startFromNow) {
    if (endMinute <= startMinute + 10) {
      endMinute += 24 * 60;
    }
  } else if (endMinute <= startMinute) {
    endMinute = startMinute + 60;
  }

  const windowMinutes = Math.max(10, endMinute - startMinute);
  const step = Math.max(1, Math.floor(windowMinutes / count));

  return Array.from({ length: count }, (_, index) => {
    const absoluteMinute = startMinute + index * step;
    const dayOffset = Math.floor(absoluteMinute / (24 * 60));
    const minuteOfDay = absoluteMinute % (24 * 60);
    return makeDateInTimeZone({
      year: parts.year,
      month: parts.month,
      day: parts.day + dayOffset,
      hour: Math.floor(minuteOfDay / 60),
      minute: minuteOfDay % 60,
      second: 0,
      timeZone: input.timeZone,
    });
  });
}

export function normalizeInstagramPublishEndHour(value?: number | string | null) {
  if (value === null || value === undefined || value === "") {
    return INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour;
  }
  const parsed = Number(String(value).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed)) {
    return INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour;
  }
  if (parsed === 0 || parsed === 24) return 24;
  return Math.max(1, Math.min(23, Math.trunc(parsed)));
}

export function formatInstagramPublishWindowLabel(endHour: number, timeZone = INSTAGRAM_AUTO_SOURCE_CONFIG.timezone) {
  const normalized = normalizeInstagramPublishEndHour(endHour);
  const endLabel = normalized === 24 ? "00:00" : `${String(normalized).padStart(2, "0")}:00`;
  return `сейчас → ${endLabel} МСК`;
}

function sanitizeRedfilmDuplicate(caption: string) {
  const escaped = INSTAGRAM_REDFILM_PHRASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return caption
    .replace(new RegExp(escaped, "gi"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildInstagramYoutubeDescription(caption?: string | null) {
  const original = sanitizeRedfilmDuplicate(caption?.trim() || "");
  const parts = [INSTAGRAM_REDFILM_PHRASE, ""];

  if (original) {
    parts.push(original);
  } else {
    parts.push("Короткий момент из фильма.");
  }

  const hasHashtags = /(^|\s)#[\p{L}\p{N}_]+/u.test(original);
  if (!hasHashtags) {
    parts.push("", "#shorts #film #movie #redfilm");
  }

  return parts.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function cleanTitleBase(value?: string | null) {
  const text = (value || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#\S+/g, "")
    .replace(new RegExp(INSTAGRAM_REDFILM_PHRASE, "gi"), "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "Короткий момент из фильма";
  const sentences = text.split(/[.!?…]/).map((item) => item.trim()).filter(Boolean);
  return (sentences[0] || text).slice(0, 75).trim() || "Короткий момент из фильма";
}

async function uniqueYoutubeTitle(input: { caption?: string | null; username?: string | null; shortcode?: string | null }) {
  const base = cleanTitleBase(input.caption);
  const variants = [
    base,
    `${base} | REDFILM`,
    `${base} #shorts`,
    input.username ? `${base} — ${input.username}` : `${base} — Movie Short`,
    input.shortcode ? `${base} ${input.shortcode.slice(0, 5)}` : `${base} ${Date.now().toString().slice(-4)}`,
  ].map((title) => title.replace(/\s+/g, " ").trim().slice(0, 95));

  for (const title of variants) {
    const exists = await db(() => prisma.factoryPublish.findFirst({ where: { title }, select: { id: true } }));
    if (!exists) return title;
  }

  return `${base.slice(0, 82)} ${Date.now().toString().slice(-6)}`.trim();
}

async function sha256File(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function secondsForReadyShort(duration?: number | null) {
  if (!duration || !Number.isFinite(duration)) return 60;
  return Math.max(8, Math.min(180, Math.ceil(duration)));
}

export function extractInstagramSourcesFromText(text: string) {
  const urls = extractInstagramSourceUrls(text);
  if (urls.length > 0) return urls;
  const trimmed = text.trim();
  if (/^@?[a-zA-Z0-9._]{2,30}$/.test(trimmed)) {
    return [normalizeInstagramSourceUrl(trimmed).sourceUrl];
  }
  return [];
}

export async function addInstagramAutoSource(input: {
  chatId: string;
  sourceUrl: string;
  dailyLimit?: number;
}) {
  const normalized = normalizeInstagramSourceUrl(input.sourceUrl);
  if (normalized.kind !== "profile") {
    throw new Error("Нужно отправить ссылку на публичный Instagram-аккаунт, а не на отдельный Reel");
  }

  const chat = await db(() =>
    prisma.factoryTelegramChat.findUnique({ where: { chatId: String(input.chatId) }, select: { id: true } }),
  );
  if (!chat) throw new Error("Telegram chat не найден");

  return db(() =>
    prisma.factoryInstagramAutoSource.upsert({
      where: { chatId_sourceUrl: { chatId: chat.id, sourceUrl: normalized.sourceUrl } },
      update: {
        isEnabled: true,
        username: normalized.username,
        sourceTitle: normalized.username ? `@${normalized.username}` : normalized.sourceUrl,
        dailyLimit: input.dailyLimit ?? INSTAGRAM_AUTO_SOURCE_CONFIG.dailyLimit,
        publishStartHour: INSTAGRAM_AUTO_SOURCE_CONFIG.publishStartHour,
        publishEndHour: INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour,
        timezone: INSTAGRAM_AUTO_SOURCE_CONFIG.timezone,
        lastError: null,
      },
      create: {
        chatId: chat.id,
        sourceUrl: normalized.sourceUrl,
        username: normalized.username,
        sourceTitle: normalized.username ? `@${normalized.username}` : normalized.sourceUrl,
        dailyLimit: input.dailyLimit ?? INSTAGRAM_AUTO_SOURCE_CONFIG.dailyLimit,
        publishStartHour: INSTAGRAM_AUTO_SOURCE_CONFIG.publishStartHour,
        publishEndHour: INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour,
        timezone: INSTAGRAM_AUTO_SOURCE_CONFIG.timezone,
      },
    }),
  );
}

export async function listInstagramAutoSources(chatId?: string) {
  return db(() =>
    prisma.factoryInstagramAutoSource.findMany({
      where: chatId ? { chat: { chatId: String(chatId) } } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { videos: true } },
      },
    }),
  );
}

async function saveDiscoveredVideos(source: FactoryInstagramAutoSource, videos: InstagramPublicVideo[]) {
  let newCount = 0;
  let duplicateCount = 0;

  for (const video of videos) {
    const existing = await db(() =>
      prisma.factoryInstagramAutoSourceVideo.findFirst({
        where: {
          OR: [
            { sourceId: source.id, sourceUrl: video.sourceUrl },
            ...(video.shortcode ? [{ sourceId: source.id, shortcode: video.shortcode }] : []),
          ],
        },
        select: { id: true },
      }),
    );

    if (existing) {
      duplicateCount += 1;
      continue;
    }

    await db(() =>
      prisma.factoryInstagramAutoSourceVideo.create({
        data: {
          sourceId: source.id,
          shortcode: video.shortcode || null,
          sourceUrl: video.sourceUrl,
          mediaUrl: video.mediaUrl || null,
          caption: video.caption || null,
          thumbnailUrl: video.thumbnailUrl || null,
          durationSec: video.durationSeconds || null,
          width: video.width || null,
          height: video.height || null,
          status: "NEW",
        },
      }),
    );
    newCount += 1;
  }

  return { newCount, duplicateCount };
}

export async function checkInstagramAutoSource(id: string) {
  const source = await db(() => prisma.factoryInstagramAutoSource.findUnique({ where: { id } }));
  if (!source) throw new Error("Instagram-источник не найден");

  const videos = await listInstagramPublicVideos({
    sourceUrl: source.sourceUrl,
    username: source.username || undefined,
    limit: INSTAGRAM_AUTO_SOURCE_CONFIG.maxScanPerSource,
  });
  const saved = await saveDiscoveredVideos(source, videos);

  await db(() =>
    prisma.factoryInstagramAutoSource.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastError: null },
    }),
  );

  return {
    foundCount: videos.length,
    newCount: saved.newCount,
    duplicateCount: saved.duplicateCount,
    examples: videos.slice(0, 5).map((video) => video.sourceUrl),
  };
}

function shouldUseVideo(video: { durationSec: number | null }) {
  if (!video.durationSec) return true;
  return (
    video.durationSec >= INSTAGRAM_AUTO_SOURCE_CONFIG.minDurationSeconds &&
    video.durationSec <= INSTAGRAM_AUTO_SOURCE_CONFIG.maxDurationSeconds
  );
}

function roundRobinPick<T extends { sourceId: string }>(items: T[], limit: number) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.sourceId) || [];
    group.push(item);
    groups.set(item.sourceId, group);
  }

  const picked: T[] = [];
  while (picked.length < limit && Array.from(groups.values()).some((group) => group.length > 0)) {
    for (const group of groups.values()) {
      const item = group.shift();
      if (item) picked.push(item);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

async function ensureDiscoveredForSources(sources: FactoryInstagramAutoSource[]) {
  let foundCount = 0;
  let newCount = 0;
  let duplicateCount = 0;

  for (const source of sources) {
    try {
      const videos = await listInstagramPublicVideos({
        sourceUrl: source.sourceUrl,
        username: source.username || undefined,
        limit: INSTAGRAM_AUTO_SOURCE_CONFIG.maxScanPerSource,
      });
      const saved = await saveDiscoveredVideos(source, videos);
      foundCount += videos.length;
      newCount += saved.newCount;
      duplicateCount += saved.duplicateCount;
      await db(() =>
        prisma.factoryInstagramAutoSource.update({
          where: { id: source.id },
          data: { lastError: null, lastRunAt: new Date() },
        }),
      );
    } catch (error) {
      const message = humanizeInstagramAutoSourceError(error);
      await db(() =>
        prisma.factoryInstagramAutoSource.update({
          where: { id: source.id },
          data: { lastError: message, lastRunAt: new Date() },
        }),
      );
      console.error("[INSTAGRAM] source scan failed", source.sourceUrl, error);
    }
  }

  return { foundCount, newCount, duplicateCount };
}

async function createInstagramJob(input: {
  videoId: string;
  sourceUrl: string;
  sourceUsername?: string | null;
  sourceFilePath: string;
  caption?: string | null;
  shortcode?: string | null;
  durationSeconds?: number | null;
  scheduledAt: Date;
}) {
  const account = await db(() =>
    prisma.factoryAccount.findFirst({
      where: { platform: "YOUTUBE" },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (!account) throw new Error("Нет доступного YouTube-аккаунта для публикации");

  const title = await uniqueYoutubeTitle({
    caption: input.caption,
    username: input.sourceUsername,
    shortcode: input.shortcode,
  });
  const description = buildInstagramYoutubeDescription(input.caption);
  const clipSeconds = secondsForReadyShort(input.durationSeconds);

  const job = await db(() =>
    prisma.factoryJob.create({
      data: {
        sourceUrl: input.sourceUrl,
        sourceFilePath: input.sourceFilePath,
        sourceOriginalName: title,
        clipSeconds,
        titlePrefix: "INSTAGRAM:",
        longVideoDescription: description,
        game: "OTHER",
        platforms: [account.platform],
        status: "QUEUED",
        progressLabel: `Instagram Reel · публикация ${input.scheduledAt.toLocaleString("ru-RU", { timeZone: INSTAGRAM_AUTO_SOURCE_CONFIG.timezone })}`,
        publishTiming: "USA_SMART",
        scheduledAt: input.scheduledAt,
        cutMode: "MOVIE_SMART",
        smartStepSeconds: 60,
        smartCandidates: 1,
        smartMinGapSeconds: 60,
        recommendation: JSON.stringify({ source: "instagram_auto_source", singleReadyShort: true }),
        targets: {
          create: {
            accountId: account.id,
            platform: account.platform,
            titlePrefix: "INSTAGRAM:",
            maxClips: 1,
          },
        },
      },
    }),
  );

  await db(() =>
    prisma.factoryInstagramAutoSourceVideo.update({
      where: { id: input.videoId },
      data: {
        factoryJobId: job.id,
        status: "JOB_CREATED",
        pickedAt: new Date(),
        downloadedAt: new Date(),
        error: null,
      },
    }),
  );

  return job;
}

export async function runInstagramAutoSourcesDaily(input?: {
  chatId?: string;
  limit?: number;
  runDate?: string;
  force?: boolean;
  startFromNow?: boolean;
  publishEndHour?: number;
}) {
  const runDate = input?.runDate || dateKey();
  const limit = Math.max(1, Math.min(50, input?.limit ?? INSTAGRAM_AUTO_SOURCE_CONFIG.dailyLimit));
  const publishEndHour = normalizeInstagramPublishEndHour(input?.publishEndHour);

  const sources = await db(() =>
    prisma.factoryInstagramAutoSource.findMany({
      where: {
        isEnabled: true,
        ...(input?.chatId ? { chat: { chatId: String(input.chatId) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  if (sources.length === 0) {
    return { foundCount: 0, newCount: 0, duplicateCount: 0, downloadedCount: 0, createdJobsCount: 0, skippedCount: 0, failedCount: 0 };
  }

  const alreadyRan = !input?.force
    ? await db(() =>
        prisma.factoryInstagramAutoSourceRun.findFirst({
          where: { runDate, status: { in: ["STARTED", "DONE"] }, ...(input?.chatId ? { source: { chat: { chatId: String(input.chatId) } } } : {}) },
          select: { id: true },
        }),
      )
    : null;

  if (alreadyRan) {
    return { foundCount: 0, newCount: 0, duplicateCount: 0, downloadedCount: 0, createdJobsCount: 0, skippedCount: 0, failedCount: 0 };
  }

  const scan = await ensureDiscoveredForSources(sources);

  const unused = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: {
        sourceId: { in: sources.map((source) => source.id) },
        status: { in: ["NEW", "DISCOVERED", "FAILED"] },
        factoryJobId: null,
      },
      include: { source: true },
      orderBy: [{ createdAt: "desc" }],
      take: Math.max(limit * 5, limit),
    }),
  );

  const candidates = unused.filter(shouldUseVideo);
  const picked = roundRobinPick(candidates, limit);
  const slots = scheduledSlots({
    count: picked.length,
    startHour: sources[0]?.publishStartHour ?? INSTAGRAM_AUTO_SOURCE_CONFIG.publishStartHour,
    endHour: input?.startFromNow ? publishEndHour : (sources[0]?.publishEndHour ?? INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour),
    timeZone: sources[0]?.timezone || INSTAGRAM_AUTO_SOURCE_CONFIG.timezone,
    startFromNow: Boolean(input?.startFromNow),
  });

  let downloadedCount = 0;
  let createdJobsCount = 0;
  let failedCount = 0;

  for (let index = 0; index < picked.length; index += 1) {
    const video = picked[index];
    const run = await db(() =>
      prisma.factoryInstagramAutoSourceRun.upsert({
        where: { sourceId_runDate: { sourceId: video.sourceId, runDate } },
        update: { status: "STARTED" },
        create: { sourceId: video.sourceId, runDate, status: "STARTED" },
      }),
    );

    try {
      const dir = path.join(FACTORY_SOURCE_DIR, "instagram", video.sourceId, runDate, safeFileName(video.shortcode || video.id));
      const downloaded = await downloadInstagramPublicVideo({ sourceUrl: video.sourceUrl, outputDir: dir });
      const hash = await sha256File(downloaded.filePath);
      const stat = await fs.promises.stat(downloaded.filePath);

      const duplicateHash = await db(() =>
        prisma.factoryInstagramAutoSourceVideo.findFirst({
          where: { hash, NOT: { id: video.id }, factoryJobId: { not: null } },
          select: { id: true },
        }),
      );
      if (duplicateHash) {
        await db(() =>
          prisma.factoryInstagramAutoSourceVideo.update({
            where: { id: video.id },
            data: { status: "DUPLICATE", hash, sizeBytes: BigInt(stat.size), error: null },
          }),
        );
        await fs.promises.rm(downloaded.filePath, { force: true }).catch(() => undefined);
        continue;
      }

      downloadedCount += 1;
      await db(() =>
        prisma.factoryInstagramAutoSourceVideo.update({
          where: { id: video.id },
          data: {
            status: "DOWNLOADED",
            caption: downloaded.caption || video.caption,
            shortcode: downloaded.shortcode || video.shortcode,
            durationSec: downloaded.durationSeconds || video.durationSec,
            width: downloaded.width || video.width,
            height: downloaded.height || video.height,
            sizeBytes: BigInt(stat.size),
            hash,
            downloadedAt: new Date(),
            error: null,
          },
        }),
      );

      await createInstagramJob({
        videoId: video.id,
        sourceUrl: video.sourceUrl,
        sourceUsername: video.source.username,
        sourceFilePath: downloaded.filePath,
        caption: downloaded.caption || video.caption,
        shortcode: downloaded.shortcode || video.shortcode,
        durationSeconds: downloaded.durationSeconds || video.durationSec,
        scheduledAt: slots[index] ?? new Date(),
      });
      createdJobsCount += 1;

      await db(() =>
        prisma.factoryInstagramAutoSourceRun.update({
          where: { id: run.id },
          data: { pickedCount: { increment: 1 }, createdJobCount: { increment: 1 } },
        }),
      );
    } catch (error) {
      failedCount += 1;
      await db(() =>
        prisma.factoryInstagramAutoSourceVideo.update({
          where: { id: video.id },
          data: { status: "FAILED", error: humanizeInstagramAutoSourceError(error) },
        }),
      );
      await db(() =>
        prisma.factoryInstagramAutoSourceRun.update({
          where: { id: run.id },
          data: { failedCount: { increment: 1 }, error: humanizeInstagramAutoSourceError(error) },
        }),
      );
    }
  }

  await db(() =>
    prisma.factoryInstagramAutoSourceRun.updateMany({
      where: { runDate, sourceId: { in: sources.map((source) => source.id) }, status: "STARTED" },
      data: { status: "DONE", foundCount: scan.foundCount, finishedAt: new Date() },
    }),
  );

  await db(() =>
    prisma.factoryInstagramAutoSource.updateMany({
      where: { id: { in: sources.map((source) => source.id) } },
      data: { lastRunDate: runDate, lastRunAt: new Date() },
    }),
  );

  return {
    foundCount: scan.foundCount,
    newCount: scan.newCount,
    duplicateCount: scan.duplicateCount,
    downloadedCount,
    createdJobsCount,
    skippedCount: Math.max(0, candidates.length - picked.length),
    failedCount,
  };
}

export async function processDueInstagramAutoSources() {
  if (!INSTAGRAM_AUTO_SOURCE_CONFIG.enabled) return 0;

  const parts = timeZoneParts(new Date(), INSTAGRAM_AUTO_SOURCE_CONFIG.timezone);
  if (parts.hour < INSTAGRAM_AUTO_SOURCE_CONFIG.scanHour) return 0;

  const runDate = dateKey(new Date(), INSTAGRAM_AUTO_SOURCE_CONFIG.timezone);
  const sources = await db(() =>
    prisma.factoryInstagramAutoSource.findMany({
      where: {
        isEnabled: true,
        OR: [{ lastRunDate: null }, { lastRunDate: { not: runDate } }],
      },
      select: { id: true },
    }),
  );

  if (sources.length === 0) return 0;
  const result = await runInstagramAutoSourcesDaily({ runDate });
  return result.createdJobsCount;
}

export async function updateInstagramAutoSourceVideoFromJob(
  factoryJobId: string,
  result: { status: "PUBLISHED" | "FAILED"; url?: string; error?: unknown },
) {
  const video = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findFirst({ where: { factoryJobId }, select: { id: true } }),
  );
  if (!video) return;

  await db(() =>
    prisma.factoryInstagramAutoSourceVideo.update({
      where: { id: video.id },
      data: {
        status: result.status,
        publishedUrl: result.url || null,
        error: result.error ? humanizeInstagramAutoSourceError(result.error) : null,
      },
    }),
  );
}

export async function setInstagramSourcesActive(chatId: string, isEnabled: boolean) {
  return db(() =>
    prisma.factoryInstagramAutoSource.updateMany({
      where: { chat: { chatId: String(chatId) } },
      data: { isEnabled },
    }),
  );
}

export function humanizeInstagramAutoSourceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("private") || lower.includes("login") || lower.includes("sign in")) {
    return "Аккаунт закрытый или Instagram просит вход. Автоматически скачать нельзя.";
  }
  if (lower.includes("rate") || lower.includes("429") || lower.includes("blocked")) {
    return "Instagram временно ограничил доступ. Попробую позже.";
  }
  if (lower.includes("yt-dlp")) return "yt-dlp не смог скачать Instagram Reel";
  if (lower.includes("не найден") || lower.includes("not found") || lower.includes("404")) return "Instagram Reel не найден или удалён";
  return message.trim().slice(0, 500) || "неизвестная ошибка Instagram";
}
