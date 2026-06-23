import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { FactoryInstagramAutoSource } from "@prisma/client";

import { prisma } from "../prisma";
import { FACTORY_SOURCE_DIR } from "./paths";
import { withDbRetry } from "./db-retry";
import { safeFileName } from "./video";
import { FACTORY_CONFIG } from "./factory-config";
import { INSTAGRAM_AUTO_SOURCE_CONFIG } from "./instagram-auto-source-config";
import { getErrorMessage, isInstagramRateLimitError } from "./instagram-errors";
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

const INSTAGRAM_GLOBAL_COOLDOWN_SETTING_KEY = "instagram.cooldownUntil";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + Math.max(1, hours) * 60 * 60 * 1000);
}

function parseDateSetting(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getInstagramGlobalCooldownUntil() {
  const setting = await db(() =>
    prisma.factorySetting.findUnique({
      where: { key: INSTAGRAM_GLOBAL_COOLDOWN_SETTING_KEY },
      select: { value: true },
    }),
  );
  return parseDateSetting(setting?.value);
}

function isCooldownActive(value?: Date | string | null, now = new Date()) {
  if (!value) return false;
  return new Date(value).getTime() > now.getTime();
}

async function setInstagramCooldown(sourceId: string, error: unknown) {
  const cooldownUntil = addHours(new Date(), INSTAGRAM_AUTO_SOURCE_CONFIG.cooldownHours);
  const message = humanizeInstagramAutoSourceError(error);

  await db(() =>
    prisma.factorySetting.upsert({
      where: { key: INSTAGRAM_GLOBAL_COOLDOWN_SETTING_KEY },
      update: { value: cooldownUntil.toISOString() },
      create: { key: INSTAGRAM_GLOBAL_COOLDOWN_SETTING_KEY, value: cooldownUntil.toISOString() },
    }),
  );

  await db(() =>
    prisma.factoryInstagramAutoSource.update({
      where: { id: sourceId },
      data: { cooldownUntil, lastError: message, lastScanAt: new Date() },
    }),
  );

  console.warn("[INSTAGRAM] rate limited, cooldown until", cooldownUntil.toISOString());
  return cooldownUntil;
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

export type InstagramSourceUsageStats = {
  total: number;
  available: number;
  queued: number;
  downloaded: number;
  rendered: number;
  published: number;
  failed: number;
  duplicate: number;
};

function emptyUsageStats(): InstagramSourceUsageStats {
  return { total: 0, available: 0, queued: 0, downloaded: 0, rendered: 0, published: 0, failed: 0, duplicate: 0 };
}

const REUSABLE_INSTAGRAM_VIDEO_STATUSES = ["NEW", "DISCOVERED", "CANCELED"] as const;

function reusableInstagramVideoStatuses(): string[] {
  return Array.from(REUSABLE_INSTAGRAM_VIDEO_STATUSES);
}

function isReusableInstagramVideoState(video: { status?: string | null; factoryJobId?: string | null; queuedAt?: Date | null; publishedAtChannel?: Date | null }) {
  return (
    REUSABLE_INSTAGRAM_VIDEO_STATUSES.includes(String(video.status || "") as (typeof REUSABLE_INSTAGRAM_VIDEO_STATUSES)[number]) &&
    !video.factoryJobId &&
    !video.queuedAt &&
    !video.publishedAtChannel
  );
}


function normalizeInstagramVideoUrlKey(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const match = url.pathname.match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
    if (match?.[1]) return `shortcode:${match[1].toLowerCase()}`;
    const pathname = url.pathname.replace(/\/+$/, "").toLowerCase();
    return pathname ? `url:${host}${pathname}` : null;
  } catch {
    const match = value.match(/instagram\.com\/(?:reel|p|tv)\/([^/?#\s]+)/i);
    return match?.[1] ? `shortcode:${match[1].toLowerCase()}` : null;
  }
}

function normalizeCaptionKey(value?: string | null) {
  const cleaned = (value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(new RegExp(INSTAGRAM_REDFILM_PHRASE, "gi"), "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 24) return null;
  return `caption:${cleaned.slice(0, 180)}`;
}

function instagramVideoDedupeKeys(video: { shortcode?: string | null; sourceUrl?: string | null; caption?: string | null }) {
  const keys = new Set<string>();
  if (video.shortcode) keys.add(`shortcode:${video.shortcode.toLowerCase()}`);
  const urlKey = normalizeInstagramVideoUrlKey(video.sourceUrl);
  if (urlKey) keys.add(urlKey);
  const captionKey = normalizeCaptionKey(video.caption);
  if (captionKey) keys.add(captionKey);
  return Array.from(keys);
}

function bestInstagramVideoDedupeKey(video: { shortcode?: string | null; sourceUrl?: string | null; caption?: string | null }) {
  const keys = instagramVideoDedupeKeys(video);
  return keys.find((key) => key.startsWith("shortcode:")) || keys.find((key) => key.startsWith("url:")) || keys[0] || null;
}

function isReusableInstagramVideoStatus(status?: string | null) {
  return REUSABLE_INSTAGRAM_VIDEO_STATUSES.includes(String(status || "") as (typeof REUSABLE_INSTAGRAM_VIDEO_STATUSES)[number]);
}

function isBlockedInstagramVideoStatus(status?: string | null) {
  return !["FAILED", "CANCELED", "DUPLICATE"].includes(String(status || ""));
}

function countVideoStats(
  videos: Array<{
    sourceId: string;
    status: string;
    factoryJobId?: string | null;
    queuedAt?: Date | null;
    downloadedAt?: Date | null;
    renderedAt?: Date | null;
    publishedAtChannel?: Date | null;
    failedAt?: Date | null;
  }>,
) {
  const result = new Map<string, InstagramSourceUsageStats>();

  for (const video of videos) {
    const stats = result.get(video.sourceId) || emptyUsageStats();
    stats.total += 1;

    if (video.status === "DUPLICATE") stats.duplicate += 1;
    if (video.status === "PUBLISHED" || video.publishedAtChannel) stats.published += 1;
    else if (video.status === "FAILED" || video.failedAt) stats.failed += 1;
    else if (video.status === "RENDERED" || video.renderedAt) stats.rendered += 1;
    else if (video.status === "DOWNLOADED" || video.downloadedAt) stats.downloaded += 1;
    else if (video.status === "JOB_CREATED" || video.status === "QUEUED" || video.queuedAt || video.factoryJobId) stats.queued += 1;
    else if (isReusableInstagramVideoState(video)) stats.available += 1;

    result.set(video.sourceId, stats);
  }

  return result;
}

export async function getInstagramSourceUsageStats(sourceIds: string[]) {
  if (sourceIds.length === 0) return new Map<string, InstagramSourceUsageStats>();

  const videos = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: { sourceId: { in: sourceIds } },
      select: {
        sourceId: true,
        status: true,
        factoryJobId: true,
        queuedAt: true,
        downloadedAt: true,
        renderedAt: true,
        publishedAtChannel: true,
        failedAt: true,
      },
    }),
  );

  return countVideoStats(videos);
}

async function saveDiscoveredVideos(source: FactoryInstagramAutoSource, videos: InstagramPublicVideo[]) {
  let newCount = 0;
  let duplicateCount = 0;

  const existingVideos = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: { sourceId: source.id },
      select: { id: true, sourceUrl: true, shortcode: true, caption: true, status: true, factoryJobId: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  const keyToExisting = new Map<string, (typeof existingVideos)[number]>();
  for (const existing of existingVideos) {
    for (const key of instagramVideoDedupeKeys(existing)) {
      if (!keyToExisting.has(key)) keyToExisting.set(key, existing);
    }
  }

  const seenThisScan = new Set<string>();

  for (const video of videos) {
    const keys = instagramVideoDedupeKeys(video);
    const primaryKey = keys[0] || video.sourceUrl;
    const alreadyInThisScan = keys.some((key) => seenThisScan.has(key));
    const existing = keys.map((key) => keyToExisting.get(key)).find(Boolean);

    for (const key of keys) seenThisScan.add(key);

    if (alreadyInThisScan || existing) {
      duplicateCount += 1;
      if (existing) {
        await db(() =>
          prisma.factoryInstagramAutoSourceVideo.update({
            where: { id: existing.id },
            data: {
              seenAt: new Date(),
              caption: video.caption || undefined,
              thumbnailUrl: video.thumbnailUrl || undefined,
              durationSec: video.durationSeconds || undefined,
              width: video.width || undefined,
              height: video.height || undefined,
              sourcePublishedAt: video.publishedAt || undefined,
            },
          }),
        );
      }
      console.info("[INSTAGRAM] duplicate reel skipped", {
        source: source.username ? `@${source.username}` : source.sourceUrl,
        key: primaryKey,
      });
      continue;
    }

    const created = await db(() =>
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
          sourcePublishedAt: video.publishedAt || null,
          seenAt: new Date(),
          status: "NEW",
        },
        select: { id: true, sourceUrl: true, shortcode: true, caption: true, status: true, factoryJobId: true },
      }),
    );

    for (const key of instagramVideoDedupeKeys(created)) {
      if (!keyToExisting.has(key)) keyToExisting.set(key, created);
    }
    newCount += 1;
  }

  return { newCount, duplicateCount };
}

export async function checkInstagramAutoSource(id: string, input?: { limit?: number }) {
  const source = await db(() => prisma.factoryInstagramAutoSource.findUnique({ where: { id } }));
  if (!source) throw new Error("Instagram-источник не найден");

  const limit = Math.max(1, Math.min(FACTORY_CONFIG.instagramDeepScanLimit, input?.limit ?? FACTORY_CONFIG.instagramScanOnAddLimit));

  try {
    const videos = await listInstagramPublicVideos({
      sourceUrl: source.sourceUrl,
      username: source.username || undefined,
      limit,
    });
    const saved = await saveDiscoveredVideos(source, videos);
    const statsMap = await getInstagramSourceUsageStats([source.id]);
    const stats = statsMap.get(source.id) || emptyUsageStats();

    await db(() =>
      prisma.factoryInstagramAutoSource.update({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastScanAt: new Date(),
          lastFoundCount: videos.length,
          lastError: videos.length > 0 ? null : "No public reels found or Instagram login/rate limit",
        },
      }),
    );

    return {
      foundCount: videos.length,
      newCount: saved.newCount,
      duplicateCount: saved.duplicateCount,
      stats,
      examples: videos.slice(0, 5).map((video) => video.sourceUrl),
      error: videos.length > 0 ? null : "No public reels found",
      cooldownUntil: null as Date | null,
    };
  } catch (error) {
    const cooldownUntil = isInstagramRateLimitError(error) ? await setInstagramCooldown(source.id, error) : null;
    const message = humanizeInstagramAutoSourceError(error);
    await db(() =>
      prisma.factoryInstagramAutoSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date(), lastScanAt: new Date(), lastError: message, ...(cooldownUntil ? { cooldownUntil } : {}) },
      }),
    );
    const statsMap = await getInstagramSourceUsageStats([source.id]);

    return {
      foundCount: 0,
      newCount: 0,
      duplicateCount: 0,
      stats: statsMap.get(source.id) || emptyUsageStats(),
      examples: [],
      error: message,
      cooldownUntil,
    };
  }
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


async function markDuplicateUnusedInstagramVideos(sourceIds: string[]) {
  if (sourceIds.length === 0) return 0;

  const videos = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: {
        sourceId: { in: sourceIds },
        status: { in: reusableInstagramVideoStatuses() },
        factoryJobId: null,
      },
      select: { id: true, sourceId: true, sourceUrl: true, shortcode: true, caption: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  const seen = new Map<string, string>();
  const duplicateIds = new Set<string>();

  for (const video of videos) {
    const keys = instagramVideoDedupeKeys(video);
    const existingId = keys.map((key) => seen.get(key)).find(Boolean);
    if (existingId) {
      duplicateIds.add(video.id);
      continue;
    }
    for (const key of keys) seen.set(key, video.id);
  }

  if (duplicateIds.size === 0) return 0;

  await db(() =>
    prisma.factoryInstagramAutoSourceVideo.updateMany({
      where: { id: { in: Array.from(duplicateIds) } },
      data: { status: "DUPLICATE", error: "Duplicate reel/caption skipped before queue creation" },
    }),
  );

  console.info("[INSTAGRAM] duplicate unused videos marked", { count: duplicateIds.size });
  return duplicateIds.size;
}

async function getBlockedInstagramVideoKeys(sourceIds: string[]) {
  const blocked = new Set<string>();
  if (sourceIds.length === 0) return blocked;

  const videos = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: {
        sourceId: { in: sourceIds },
        OR: [
          { factoryJobId: { not: null } },
          { status: { in: ["DOWNLOADING", "DOWNLOADED", "JOB_CREATED", "QUEUED", "RENDERED", "UPLOADING", "PUBLISHED", "RATE_LIMIT"] } },
          { publishedAtChannel: { not: null } },
          { queuedAt: { not: null } },
        ],
      },
      select: { sourceUrl: true, shortcode: true, caption: true, status: true, factoryJobId: true },
    }),
  );

  for (const video of videos) {
    if (!isBlockedInstagramVideoStatus(video.status)) continue;
    for (const key of instagramVideoDedupeKeys(video)) blocked.add(key);
  }

  return blocked;
}

function filterUniqueReadyInstagramCandidates<T extends { sourceId: string; sourceUrl: string | null; shortcode?: string | null; caption?: string | null }>(
  candidates: T[],
  blockedKeys: Set<string>,
) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const candidate of candidates) {
    const keys = instagramVideoDedupeKeys(candidate);
    const primary = bestInstagramVideoDedupeKey(candidate);
    const isBlocked = keys.some((key) => blockedKeys.has(key));
    const isSeen = keys.some((key) => seen.has(key));
    if (isBlocked || isSeen) {
      console.info("[INSTAGRAM] candidate skipped as duplicate", { key: primary, sourceId: candidate.sourceId });
      continue;
    }
    for (const key of keys) seen.add(key);
    result.push(candidate);
  }

  return result;
}

async function acquireInstagramVideoForQueue(videoId: string) {
  const result = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.updateMany({
      where: {
        id: videoId,
        status: { in: reusableInstagramVideoStatuses() },
        factoryJobId: null,
        queuedAt: null,
      },
      data: { status: "DOWNLOADING", pickedAt: new Date(), failedAt: null, failReason: null, error: null },
    }),
  );

  return result.count === 1;
}


async function findAlreadyQueuedInstagramDuplicate(video: {
  id: string;
  sourceId: string;
  sourceUrl: string | null;
  shortcode?: string | null;
  caption?: string | null;
}) {
  const sameShortcodeOrUrlOrCaption = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: {
        sourceId: video.sourceId,
        NOT: { id: video.id },
        status: { notIn: ["FAILED", "CANCELED", "DUPLICATE"] },
        OR: [
          ...(video.sourceUrl ? [{ sourceUrl: video.sourceUrl }] : []),
          ...(video.shortcode ? [{ shortcode: video.shortcode }] : []),
          ...(normalizeCaptionKey(video.caption) ? [{ caption: video.caption }] : []),
          { factoryJobId: { not: null } },
        ],
      },
      select: { id: true, sourceUrl: true, shortcode: true, caption: true, factoryJobId: true, status: true },
      take: 200,
    }),
  );

  const keys = new Set(instagramVideoDedupeKeys(video));
  return sameShortcodeOrUrlOrCaption.find((other) =>
    other.factoryJobId && isBlockedInstagramVideoStatus(other.status) && instagramVideoDedupeKeys(other).some((key) => keys.has(key)),
  ) || null;
}

async function ensureDiscoveredForSources(sources: FactoryInstagramAutoSource[]) {
  let foundCount = 0;
  let newCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;
  let rateLimited = false;
  let cooldownUntil: Date | null = null;

  const globalCooldown = await getInstagramGlobalCooldownUntil();
  if (isCooldownActive(globalCooldown)) {
    console.warn("[INSTAGRAM] global cooldown active", { cooldownUntil: globalCooldown?.toISOString() });
    return { foundCount, newCount, duplicateCount, skippedCount: sources.length, rateLimited: true, cooldownUntil: globalCooldown };
  }

  const now = new Date();
  const activeSources = sources
    .filter((source) => {
      if (isCooldownActive(source.cooldownUntil, now)) {
        skippedCount += 1;
        console.info("[INSTAGRAM] source skipped", { source: source.username || source.sourceUrl, reason: "cooldown", cooldownUntil: source.cooldownUntil });
        return false;
      }
      return true;
    })
    .slice(0, INSTAGRAM_AUTO_SOURCE_CONFIG.maxSourcesPerRun);

  for (const [index, source] of activeSources.entries()) {
    if (index > 0) await delay(INSTAGRAM_AUTO_SOURCE_CONFIG.sourceDelaySeconds * 1000);

    try {
      console.info("[INSTAGRAM] source scan start", source.username ? `@${source.username}` : source.sourceUrl);
      const videos = await listInstagramPublicVideos({
        sourceUrl: source.sourceUrl,
        username: source.username || undefined,
        limit: INSTAGRAM_AUTO_SOURCE_CONFIG.maxScanPerSource,
      });
      const saved = await saveDiscoveredVideos(source, videos);
      const statsMap = await getInstagramSourceUsageStats([source.id]);
      const stats = statsMap.get(source.id) || emptyUsageStats();

      foundCount += videos.length;
      newCount += saved.newCount;
      duplicateCount += saved.duplicateCount;

      await db(() =>
        prisma.factoryInstagramAutoSource.update({
          where: { id: source.id },
          data: {
            lastError: videos.length > 0 ? null : "No public reels found or Instagram login/rate limit",
            lastRunAt: new Date(),
            lastScanAt: new Date(),
            lastFoundCount: videos.length,
          },
        }),
      );

      console.info("[INSTAGRAM] source scan done", {
        source: source.username ? `@${source.username}` : source.sourceUrl,
        found: videos.length,
        new: saved.newCount,
        existing: saved.duplicateCount,
        available: stats.available,
      });
    } catch (error) {
      const message = humanizeInstagramAutoSourceError(error);
      if (isInstagramRateLimitError(error)) {
        cooldownUntil = await setInstagramCooldown(source.id, error);
        rateLimited = true;
        await db(() =>
          prisma.factoryInstagramAutoSource.update({
            where: { id: source.id },
            data: { lastError: message, lastRunAt: new Date(), lastScanAt: new Date(), cooldownUntil },
          }),
        );
        console.warn("[INSTAGRAM] source skipped", { source: source.username || source.sourceUrl, reason: "rate_limit", cooldownUntil });
        break;
      }

      await db(() =>
        prisma.factoryInstagramAutoSource.update({
          where: { id: source.id },
          data: { lastError: message, lastRunAt: new Date(), lastScanAt: new Date() },
        }),
      );
      console.error("[INSTAGRAM] source scan failed", source.sourceUrl, error);
    }
  }

  return { foundCount, newCount, duplicateCount, skippedCount, rateLimited, cooldownUntil };
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

  const video = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.update({
      where: { id: input.videoId },
      data: {
        factoryJobId: job.id,
        status: "JOB_CREATED",
        queuedAt: new Date(),
        pickedAt: new Date(),
        downloadedAt: new Date(),
        failedAt: null,
        failReason: null,
        error: null,
      },
      include: { source: { select: { chatId: true, username: true, sourceUrl: true } } },
    }),
  );

  await db(() =>
    prisma.factoryTelegramJob.create({
      data: {
        chatId: video.source.chatId,
        factoryJobId: job.id,
        sourceUrl: input.sourceUrl,
        status: "QUEUED",
        lastStatusText: `⏳ В очереди: ${video.source.username ? `@${video.source.username}` : video.source.sourceUrl}`,
      },
    }),
  ).catch(() => undefined);

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

  const globalCooldown = await getInstagramGlobalCooldownUntil();
  if (isCooldownActive(globalCooldown)) {
    return {
      foundCount: 0,
      newCount: 0,
      duplicateCount: 0,
      downloadedCount: 0,
      createdJobsCount: 0,
      skippedCount: 0,
      failedCount: 0,
      cooldownUntil: globalCooldown,
      rateLimited: true,
    };
  }

  const sources = await db(() =>
    prisma.factoryInstagramAutoSource.findMany({
      where: {
        isEnabled: true,
        ...(input?.chatId ? { chat: { chatId: String(input.chatId) } } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  const now = new Date();
  const runnableSources = sources.filter((source) => !isCooldownActive(source.cooldownUntil, now));

  if (sources.length === 0 || runnableSources.length === 0) {
    return { foundCount: 0, newCount: 0, duplicateCount: 0, downloadedCount: 0, createdJobsCount: 0, skippedCount: sources.length, failedCount: 0 };
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

  const limitedSources = runnableSources.slice(0, INSTAGRAM_AUTO_SOURCE_CONFIG.maxSourcesPerRun);

  const scan = await ensureDiscoveredForSources(limitedSources);
  const limitedSourceIds = limitedSources.map((source) => source.id);
  const markedDuplicateCount = await markDuplicateUnusedInstagramVideos(limitedSourceIds);
  const blockedKeys = await getBlockedInstagramVideoKeys(limitedSourceIds);

  const unused = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findMany({
      where: {
        sourceId: { in: limitedSourceIds },
        status: { in: reusableInstagramVideoStatuses() },
        factoryJobId: null,
        queuedAt: null,
      },
      include: { source: true },
      orderBy: [{ createdAt: "asc" }],
      take: Math.max(limit * 10, limit),
    }),
  );

  const candidates = filterUniqueReadyInstagramCandidates(unused.filter(shouldUseVideo), blockedKeys);
  const picked = roundRobinPick(candidates, limit);
  const slots = scheduledSlots({
    count: picked.length,
    startHour: limitedSources[0]?.publishStartHour ?? INSTAGRAM_AUTO_SOURCE_CONFIG.publishStartHour,
    endHour: input?.startFromNow ? publishEndHour : (limitedSources[0]?.publishEndHour ?? INSTAGRAM_AUTO_SOURCE_CONFIG.publishEndHour),
    timeZone: limitedSources[0]?.timezone || INSTAGRAM_AUTO_SOURCE_CONFIG.timezone,
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
      if (index > 0) await delay(INSTAGRAM_AUTO_SOURCE_CONFIG.reelDelaySeconds * 1000);

      const acquired = await acquireInstagramVideoForQueue(video.id);
      if (!acquired) {
        console.info("[INSTAGRAM] candidate skipped because it was already queued", { videoId: video.id });
        continue;
      }

      const alreadyQueuedDuplicate = await findAlreadyQueuedInstagramDuplicate(video);
      if (alreadyQueuedDuplicate) {
        await db(() =>
          prisma.factoryInstagramAutoSourceVideo.update({
            where: { id: video.id },
            data: { status: "DUPLICATE", error: `Duplicate of already queued video ${alreadyQueuedDuplicate.id}` },
          }),
        );
        console.info("[INSTAGRAM] candidate skipped because duplicate is already queued", {
          videoId: video.id,
          duplicateId: alreadyQueuedDuplicate.id,
        });
        continue;
      }

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
            data: { status: "DUPLICATE", hash, sizeBytes: BigInt(stat.size), error: null, failReason: null, failedAt: null },
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
            failedAt: null,
            failReason: null,
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
      const message = humanizeInstagramAutoSourceError(error);
      const rateLimited = isInstagramRateLimitError(error);
      const cooldownUntil = rateLimited ? await setInstagramCooldown(video.sourceId, error) : null;

      await db(() =>
        prisma.factoryInstagramAutoSourceVideo.update({
          where: { id: video.id },
          data: {
            status: rateLimited ? "RATE_LIMIT" : "FAILED",
            failedAt: new Date(),
            failReason: message,
            error: message,
          },
        }),
      );
      await db(() =>
        prisma.factoryInstagramAutoSourceRun.update({
          where: { id: run.id },
          data: { failedCount: { increment: 1 }, error: message },
        }),
      );

      if (rateLimited) {
        console.warn("[INSTAGRAM] download stopped by rate limit", { sourceId: video.sourceId, cooldownUntil });
        break;
      }
    }
  }

  await db(() =>
    prisma.factoryInstagramAutoSourceRun.updateMany({
      where: { runDate, sourceId: { in: limitedSources.map((source) => source.id) }, status: "STARTED" },
      data: { status: "DONE", foundCount: scan.foundCount, finishedAt: new Date() },
    }),
  );

  await db(() =>
    prisma.factoryInstagramAutoSource.updateMany({
      where: { id: { in: limitedSources.map((source) => source.id) } },
      data: { lastRunDate: runDate, lastRunAt: new Date() },
    }),
  );

  return {
    foundCount: scan.foundCount,
    newCount: scan.newCount,
    duplicateCount: scan.duplicateCount + markedDuplicateCount,
    downloadedCount,
    createdJobsCount,
    skippedCount: Math.max(0, candidates.length - picked.length) + scan.skippedCount,
    failedCount,
    cooldownUntil: scan.cooldownUntil,
    rateLimited: scan.rateLimited,
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
  result: { status: "RENDERED" | "UPLOADING" | "PUBLISHED" | "FAILED"; url?: string; error?: unknown },
) {
  const video = await db(() =>
    prisma.factoryInstagramAutoSourceVideo.findFirst({ where: { factoryJobId }, select: { id: true } }),
  );
  if (!video) return;

  const now = new Date();
  const errorText = result.error ? humanizeInstagramAutoSourceError(result.error) : null;

  await db(() =>
    prisma.factoryInstagramAutoSourceVideo.update({
      where: { id: video.id },
      data: {
        status: result.status,
        renderedAt: result.status === "RENDERED" ? now : undefined,
        publishedAtChannel: result.status === "PUBLISHED" ? now : undefined,
        failedAt: result.status === "FAILED" ? now : undefined,
        publishedUrl: result.url || undefined,
        failReason: errorText,
        error: errorText,
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
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes("private") || lower.includes("login") || lower.includes("sign in")) {
    return "Аккаунт закрытый или Instagram просит вход. Автоматически скачать нельзя.";
  }
  if (isInstagramRateLimitError(error) || lower.includes("blocked")) {
    return "Instagram временно ограничил доступ. Источник поставлен на cooldown, попробую позже.";
  }
  if (lower.includes("yt-dlp")) return "yt-dlp не смог скачать Instagram Reel";
  if (lower.includes("не найден") || lower.includes("not found") || lower.includes("404")) return "Instagram Reel не найден или удалён";
  return message.trim().slice(0, 500) || "неизвестная ошибка Instagram";
}
