import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createVkMovieJob } from "@/lib/factory/create-vk-movie-job";
import { humanizeFactoryError, isChatAllowed, sendTelegramMessage } from "@/lib/factory/telegram";
import { runCommand } from "@/lib/factory/video";

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
export const LEGACY_VK_AUTO_SOURCE_TIMEZONE = "America/New_York";

export function normalizeVkAutoSourceTimezone(timezone?: string | null) {
  const value = timezone?.trim();
  if (!value || value === LEGACY_VK_AUTO_SOURCE_TIMEZONE) return DEFAULT_VK_AUTO_SOURCE_TIMEZONE;
  return value;
}

export function vkAutoSourceTimezoneLabel(timezone?: string | null) {
  const normalized = normalizeVkAutoSourceTimezone(timezone);
  return normalized === DEFAULT_VK_AUTO_SOURCE_TIMEZONE ? "МСК (Europe/Moscow)" : normalized;
}

export function isVkGroupOrVideoSourceUrl(text: string) {
  try {
    const match = text.match(/https?:\/\/[^\s<>]+/i)?.[0] || text;
    const url = new URL(match);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!["vk.com", "m.vk.com", "vkvideo.ru"].includes(host)) return false;
    const path = url.pathname.replace(/\/+$/, "");
    if (/^\/video-?\d+_\d+/i.test(path) || (path === "/video" && /video-?\d+_\d+/i.test(url.search))) return false;
    return path.length > 1;
  } catch {
    return false;
  }
}

export function normalizeVkSourceUrl(value: string) {
  const raw = value.match(/https?:\/\/[^\s<>]+/i)?.[0] || value.trim();
  const url = new URL(raw);
  let host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "m.vk.com") host = "vk.com";
  if (!["vk.com", "vkvideo.ru"].includes(host)) throw new Error("VK источник не открывается");
  let path = url.pathname.replace(/\/+$/, "") || "/";
  if (host === "vk.com" && /^\/videos\/[-\d]+$/i.test(path)) path = path.replace("/videos/", "/videos");
  return `https://${host}${path}`;
}

function sourceScreenName(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] || "";
  const owner = first.match(/^videos(-?\d+)$/i)?.[1];
  if (owner) return { ownerId: Number(owner), screenName: null };
  if (first === "video" && parts[1]?.startsWith("@")) return { ownerId: null, screenName: parts[1].slice(1) };
  if (first.startsWith("@")) return { ownerId: null, screenName: first.slice(1) };
  return { ownerId: null, screenName: first };
}


type VkListingAttempt = {
  provider: "vk-api" | "vkvideo-html" | "vk-html" | "vk-mobile-html" | "yt-dlp";
  url: string;
  status?: number;
  foundCount?: number;
  error?: string;
};

const VK_PUBLIC_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanListingText(value?: string | null) {
  return decodeHtmlEntities(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\\//g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeListingTitle(value?: string | null) {
  const title = cleanListingText(value)
    .replace(/^смотреть\s+/i, "")
    .replace(/\s*[|—-]\s*(?:VK Видео|VK|ВКонтакте)\s*$/i, "")
    .trim();

  if (!title || title.length < 4) return undefined;
  if (/^(vk|вк|vk video|vk видео|видео|video|без названия)$/i.test(title)) return undefined;
  if (/^видео\s*-?\d+_\d+$/i.test(title)) return undefined;
  return title.slice(0, 180);
}

function titleNear(html: string, position: number) {
  const slice = html.slice(Math.max(0, position - 2200), Math.min(html.length, position + 3200));
  const patterns = [
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,40})"/i,
    /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,40})"/i,
    /"caption"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,40})"/i,
    /"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,40})"/i,
    /data-title=["']([^"']{4,220})["']/i,
    /aria-label=["']([^"']{4,220})["']/i,
    /title=["']([^"']{4,220})["']/i,
    /alt=["']([^"']{4,220})["']/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{4,220})["']/i,
  ];

  for (const pattern of patterns) {
    const title = normalizeListingTitle(slice.match(pattern)?.[1]);
    if (title) return title;
  }

  return undefined;
}

function thumbnailNear(html: string, position: number) {
  const slice = html.slice(Math.max(0, position - 1200), Math.min(html.length, position + 2400)).replace(/\\\//g, "/");
  return slice.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/i)?.[0];
}

function normalizeProviderVideoId(value: string) {
  return value.replace(/^video/i, "").replace(/^\//, "");
}

function normalizeFoundVkVideoUrl(providerVideoId: string) {
  return `https://vk.com/video${normalizeProviderVideoId(providerVideoId)}`;
}

export function extractVkVideosFromHtml(html: string, baseUrl = "https://vk.com"): VkSourceVideo[] {
  const normalizedHtml = decodeHtmlEntities(html).replace(/\\\//g, "/");
  const matches: Array<{ id: string; index: number }> = [];
  const patterns = [
    /(?:https?:\/\/(?:m\.)?vk\.com)?\/video(-?\d+_\d+)/gi,
    /(?:https?:\/\/vkvideo\.ru)?\/video(-?\d+_\d+)/gi,
    /\bvideo(-?\d+_\d+)\b/gi,
    /"video_id"\s*:\s*"?(-?\d+_\d+)"?/gi,
    /"id"\s*:\s*"?video(-?\d+_\d+)"?/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedHtml))) {
      if (!match[1]) continue;
      matches.push({ id: normalizeProviderVideoId(match[1]), index: match.index });
    }
  }

  const unique = new Map<string, VkSourceVideo>();
  for (const match of matches) {
    if (!/^-?\d+_\d+$/.test(match.id)) continue;
    const current = unique.get(match.id);
    const title = titleNear(normalizedHtml, match.index) || current?.title;
    const thumbnailUrl = thumbnailNear(normalizedHtml, match.index) || current?.thumbnailUrl;
    unique.set(match.id, {
      providerVideoId: match.id,
      videoUrl: normalizeFoundVkVideoUrl(match.id),
      title,
      thumbnailUrl,
    });
  }

  const videos = Array.from(unique.values());
  console.info("VK source HTML parsed", { baseUrl, foundCount: videos.length });
  return videos;
}

function getVkSourceIdentity(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] || "";

  const videoAtName = first === "video" && parts[1]?.startsWith("@") ? parts[1].slice(1) : null;
  const atName = first.startsWith("@") ? first.slice(1) : null;
  const videosOwner = first.match(/^videos(-?\d+)$/i)?.[1] || null;
  const clubId = first.match(/^club(\d+)$/i)?.[1] || null;
  const publicId = first.match(/^public(\d+)$/i)?.[1] || null;

  return {
    host,
    slug: videoAtName || atName || first,
    screenName: videoAtName || atName || (!videosOwner && !clubId && !publicId ? first : null),
    ownerId: videosOwner ? Number(videosOwner) : clubId ? -Number(clubId) : publicId ? -Number(publicId) : null,
  };
}

function buildVkSourceCandidateUrls(sourceUrl: string) {
  const normalized = normalizeVkSourceUrl(sourceUrl);
  const identity = getVkSourceIdentity(normalized);
  const urls: string[] = [];
  const add = (url: string) => urls.push(url);

  add(normalized);

  if (identity.ownerId !== null) {
    add(`https://vk.com/videos${identity.ownerId}`);
    add(`https://m.vk.com/videos${identity.ownerId}`);
    add(`https://vk.com/video/playlist/${identity.ownerId}`);
    add(`https://vk.com/club${Math.abs(identity.ownerId)}?z=video`);
    add(`https://m.vk.com/club${Math.abs(identity.ownerId)}`);
  }

  if (identity.screenName) {
    const name = identity.screenName.replace(/^@/, "");
    add(`https://vk.com/video/@${name}`);
    add(`https://vkvideo.ru/@${name}`);
    add(`https://vkvideo.ru/@${name}/videos`);
    add(`https://vkvideo.ru/@${name}/all`);
    add(`https://vk.com/${name}?z=video`);
    add(`https://vk.com/${name}?w=video`);
    add(`https://m.vk.com/${name}`);
    add(`https://m.vk.com/video/${name}`);
  }

  return Array.from(new Set(urls));
}

function candidateProvider(url: string): VkListingAttempt["provider"] {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "vkvideo.ru") return "vkvideo-html";
  if (host === "m.vk.com") return "vk-mobile-html";
  return "vk-html";
}

async function fetchVkListingHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: VK_PUBLIC_HEADERS,
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await response.text();
    return { status: response.status, ok: response.ok, html };
  } finally {
    clearTimeout(timeout);
  }
}

async function getViaPublicHtml(sourceUrl: string, limit: number, attempts: VkListingAttempt[]) {
  const found = new Map<string, VkSourceVideo>();
  const candidates = buildVkSourceCandidateUrls(sourceUrl);

  console.info("VK auto-source public listing started", { sourceUrl, candidates });

  for (const url of candidates) {
    const attempt: VkListingAttempt = { provider: candidateProvider(url), url };
    attempts.push(attempt);
    try {
      const response = await fetchVkListingHtml(url);
      attempt.status = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const videos = extractVkVideosFromHtml(response.html, url);
      attempt.foundCount = videos.length;
      for (const video of videos) {
        const key = video.providerVideoId || video.videoUrl;
        if (!found.has(key)) found.set(key, video);
      }

      if (found.size >= limit) break;
    } catch (error) {
      attempt.error = humanizeVkAutoSourceError(error);
    }
  }

  const result = Array.from(found.values()).slice(0, limit);
  console.info("VK auto-source public listing finished", {
    sourceUrl,
    foundCount: result.length,
    attempts,
  });
  return result;
}

async function vkApi<T>(method: string, params: Record<string, string | number>, token: string) {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), access_token: token, v: VK_API_VERSION });
  const response = await fetch(`https://api.vk.com/method/${method}?${query}`, { cache: "no-store" });
  const body = (await response.json()) as { response?: T; error?: { error_msg?: string } };
  if (!response.ok || body.error || body.response === undefined) throw new Error(body.error?.error_msg || `VK API HTTP ${response.status}`);
  return body.response;
}

async function getViaVkApi(sourceUrl: string, limit: number, token: string): Promise<VkSourceVideo[]> {
  const parsed = sourceScreenName(sourceUrl);
  let ownerId = parsed.ownerId;
  if (ownerId === null) {
    const resolved = await vkApi<{ object_id?: number; type?: string }>("utils.resolveScreenName", { screen_name: parsed.screenName || "" }, token);
    if (!resolved.object_id) throw new Error("VK источник не открывается");
    ownerId = resolved.type === "group" || resolved.type === "page" ? -Math.abs(resolved.object_id) : resolved.object_id;
  }
  const result = await vkApi<{ items: Array<{ id: number; owner_id: number; title?: string; duration?: number; date?: number; image?: Array<{ url: string; width: number }> }> }>(
    "video.get",
    { owner_id: ownerId, count: Math.min(200, Math.max(1, limit)), extended: 0 },
    token,
  );
  return result.items.map((item) => ({
    providerVideoId: `${item.owner_id}_${item.id}`,
    videoUrl: `https://vk.com/video${item.owner_id}_${item.id}`,
    title: item.title?.trim() || undefined,
    durationSec: item.duration || undefined,
    publishedAt: item.date ? new Date(item.date * 1000) : undefined,
    thumbnailUrl: item.image?.sort((a, b) => b.width - a.width)[0]?.url,
  }));
}

async function getViaYtDlp(sourceUrl: string, limit: number): Promise<VkSourceVideo[]> {
  let output = "";
  await runCommand(
    "yt-dlp",
    ["--flat-playlist", "--dump-json", "--playlist-end", String(limit), "--socket-timeout", "30", sourceUrl],
    { onOutput: (text) => { output += text; } },
  );
  const videos: VkSourceVideo[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const item = JSON.parse(line) as { id?: string; url?: string; webpage_url?: string; title?: string; duration?: number; timestamp?: number; thumbnail?: string };
      const id = item.id?.match(/-?\d+_\d+/)?.[0];
      const videoUrl = id ? `https://vk.com/video${id}` : item.webpage_url || item.url;
      if (!videoUrl?.startsWith("http")) continue;
      videos.push({ providerVideoId: id || item.id, videoUrl, title: item.title, durationSec: item.duration, publishedAt: item.timestamp ? new Date(item.timestamp * 1000) : undefined, thumbnailUrl: item.thumbnail });
    } catch {
      // yt-dlp иногда пишет служебные строки между JSON-объектами.
    }
  }
  if (!videos.length) throw new Error("yt-dlp не смог получить список");
  return videos;
}

export async function getVkSourceVideos(input: { sourceUrl: string; limit: number }) {
  const sourceUrl = normalizeVkSourceUrl(input.sourceUrl);
  const limit = Math.max(1, Math.min(200, input.limit));
  const token = process.env.VK_SERVICE_TOKEN?.trim() || process.env.VK_ACCESS_TOKEN?.trim();
  const attempts: VkListingAttempt[] = [];
  const errors: string[] = [];
  let videos: VkSourceVideo[] = [];

  if (token) {
    try {
      videos = await getViaVkApi(sourceUrl, limit, token);
      attempts.push({ provider: "vk-api", url: sourceUrl, foundCount: videos.length });
    } catch (error) {
      errors.push(humanizeVkAutoSourceError(error));
      attempts.push({ provider: "vk-api", url: sourceUrl, error: humanizeVkAutoSourceError(error) });
    }
  }

  if (!videos.length) {
    try {
      videos = await getViaPublicHtml(sourceUrl, limit, attempts);
    } catch (error) {
      errors.push(humanizeVkAutoSourceError(error));
    }
  }

  if (!videos.length && process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true") {
    try {
      videos = await getViaYtDlp(sourceUrl, limit);
      attempts.push({ provider: "yt-dlp", url: sourceUrl, foundCount: videos.length });
    } catch (error) {
      errors.push(humanizeVkAutoSourceError(error));
      attempts.push({ provider: "yt-dlp", url: sourceUrl, error: humanizeVkAutoSourceError(error) });
    }
  }

  const unique = new Map<string, VkSourceVideo>();
  for (const video of videos) {
    if (video.durationSec !== undefined && video.durationSec < 15) continue;
    const providerVideoId = video.providerVideoId || video.videoUrl.match(/video(-?\d+_\d+)/i)?.[1];
    const normalizedVideoUrl = providerVideoId ? normalizeFoundVkVideoUrl(providerVideoId) : video.videoUrl.split(/[?#]/)[0];
    const key = providerVideoId || normalizedVideoUrl;
    if (!unique.has(key)) unique.set(key, { ...video, providerVideoId, videoUrl: normalizedVideoUrl });
  }

  console.info("VK auto-source listing result", {
    sourceUrl,
    foundCount: unique.size,
    attempts,
    errors,
  });

  if (!unique.size) {
    throw new Error(
      "Не получилось получить список видео из VK-источника. Попробуй отправить именно раздел видео: https://vk.com/videos-123456789 или https://vk.com/video/@groupname. Если VK закрывает страницу от гостей, список без авторизации не прочитается.",
    );
  }

  return Array.from(unique.values()).slice(0, limit);
}

export function humanizeVkAutoSourceError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("не получилось получить список видео из vk-источника")) return message;
  if (lower.includes("service_token") || lower.includes("access token")) return "VK_SERVICE_TOKEN не настроен или недействителен";
  if (lower.includes("yt-dlp")) return "yt-dlp не смог получить список";
  if (lower.includes("ffmpeg")) return "ошибка ffmpeg";
  if (lower.includes("youtube") || lower.includes("r2") || lower.includes("720")) return humanizeFactoryError(error);
  if (lower.includes("http") || lower.includes("resolve") || lower.includes("не открывается")) return "VK источник не открывается";
  if (lower.includes("список") || lower.includes("video.get")) return "VK не отдал список видео";
  return message.trim() || "неизвестная ошибка";
}

function localParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)])) as Record<string, number>;
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
  if (!source) throw new Error("VK источник не найден");
  if (!source.chat.isAllowed || !isChatAllowed(source.chat.chatId)) throw new Error("Автозабор доступен только разрешённым chatId");
  if (!source.isEnabled && !options.force) return null;
  const sourceTimezone = normalizeVkAutoSourceTimezone(source.timezone);
  if (source.timezone !== sourceTimezone) {
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { timezone: sourceTimezone } });
  }
  const today = getSourceRunDate(sourceTimezone);
  const runDate = options.force ? `${today}#${Date.now()}` : today;
  let run;
  try {
    run = await prisma.factoryVkAutoSourceRun.create({ data: { sourceId, runDate } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }

  await notifyVkAutoSourceRun(run.id, `📡 Автозабор запущен: ${source.sourceTitle || source.sourceUrl}\nИщу до ${source.dailyLimit} новых видео.`);
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
        const job = await createVkMovieJob({ sourceUrl: video.videoUrl, movieTitle: video.title || "VK видео", clipCount: 1, clipSeconds, scheduleMode: "NOW", scheduleStartHour: source.publishStartHour, scheduleEndHour: source.publishEndHour, scheduleIntervalMinutes: intervalMinutes || 60, timeZone: sourceTimezone, scheduledAt });
        await prisma.factoryVkAutoSourceVideo.update({ where: { id: video.id }, data: { status: "QUEUED", factoryJobId: job.id } });
        created += 1;
      } catch (error) {
        failed += 1;
        await prisma.factoryVkAutoSourceVideo.update({ where: { id: video.id }, data: { status: "FAILED", error: humanizeVkAutoSourceError(error) } });
      }
    }

    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: created ? "JOBS_CREATED" : "DONE", foundCount, pickedCount: picked.length, createdJobCount: created, failedCount: failed, ...(created ? {} : { finishedAt: new Date() }) } });
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastRunDate: today, lastRunAt: new Date(), nextRunAt: nextRunAt(today, sourceTimezone), lastError: null } });
    await notifyVkAutoSourceRun(run.id, `✅ Найдено и взято в работу: ${created} видео.\nСоздано задач: ${created}.\nПубликация: ${source.publishStartHour}:00–${source.publishEndHour}:00.${failed ? `\nОшибок создания: ${failed}.` : ""}`);
    if (!created) await notifyVkAutoSourceRun(run.id, `🏁 Автозабор завершён.\nИсточник: ${source.sourceTitle || source.sourceUrl}\nСоздано задач: 0\nОпубликовано: 0\nОшибок: ${failed}`);
    return run;
  } catch (error) {
    const reason = humanizeVkAutoSourceError(error);
    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: "FAILED", error: reason, failedCount: 1, finishedAt: new Date() } });
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastRunDate: today, lastRunAt: new Date(), nextRunAt: nextRunAt(today, sourceTimezone), lastError: reason } });
    await notifyVkAutoSourceRun(run.id, `❌ Ошибка автозабора VK:\nИсточник: ${source.sourceTitle || source.sourceUrl}\nПричина: ${reason}`);
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
  if (input.run.createdJobCount >= input.source.dailyLimit * 2) return false;
  const successfulOrActive = await prisma.factoryVkAutoSourceVideo.count({
    where: {
      sourceId: input.source.id,
      pickedAt: { gte: input.run.startedAt },
      status: { in: ["PUBLISHED", "QUEUED", "PROCESSING"] },
    },
  });
  if (successfulOrActive >= input.source.dailyLimit) return false;
  const replacement = await prisma.factoryVkAutoSourceVideo.findFirst({
    where: { sourceId: input.source.id, status: "NEW", factoryJobId: null },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  if (!replacement) return false;
  const claimed = await prisma.factoryVkAutoSourceVideo.updateMany({
    where: { id: replacement.id, status: "NEW", factoryJobId: null },
    data: { status: "PROCESSING", pickedAt: new Date(), error: null },
  });
  if (!claimed.count) return false;
  try {
    const job = await createVkMovieJob({
      sourceUrl: replacement.videoUrl,
      movieTitle: replacement.title || "VK видео",
      clipCount: 1,
      clipSeconds: Math.max(15, Math.min(60, replacement.durationSec || 60)),
      scheduleMode: "NOW",
      scheduleStartHour: input.source.publishStartHour,
      scheduleEndHour: input.source.publishEndHour,
      scheduleIntervalMinutes: 60,
      timeZone: normalizeVkAutoSourceTimezone(input.source.timezone),
      scheduledAt: new Date(),
    });
    await prisma.$transaction([
      prisma.factoryVkAutoSourceVideo.update({ where: { id: replacement.id }, data: { status: "QUEUED", factoryJobId: job.id } }),
      prisma.factoryVkAutoSourceRun.update({ where: { id: input.run.id }, data: { pickedCount: { increment: 1 }, createdJobCount: { increment: 1 } } }),
    ]);
    await notifyVkAutoSourceRun(input.run.id, `🔄 Вместо неудачного видео взято следующее: ${replacement.title || replacement.videoUrl}`);
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
  if (result.status === "PUBLISHED") await notifyVkAutoSourceRun(run.id, `✅ Опубликовано ${publishedCount}/${run.createdJobCount}: ${result.url}`);
  const terminal = publishedCount + failedJobs;
  if (terminal >= run.createdJobCount) {
    await prisma.factoryVkAutoSourceRun.update({ where: { id: run.id }, data: { status: failedCount ? "DONE_WITH_ERRORS" : "DONE", finishedAt: new Date() } });
    await notifyVkAutoSourceRun(run.id, `🏁 Автозабор завершён.\nИсточник: ${video.source.sourceTitle || video.source.sourceUrl}\nСоздано задач: ${run.createdJobCount}\nОпубликовано: ${publishedCount}\nОшибок: ${failedCount}`);
  }
}
