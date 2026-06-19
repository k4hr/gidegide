const SITE_URL = "https://vkvideodownload.com";
const API_URL = `${SITE_URL}/wp-json/aio-dl/video-data/`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Safari/537.36";

export type VkVideoDownloadResolved = {
  sourceUrl: string;
  directUrl: string;
  quality?: string;
  format?: string;
  title?: string;
  durationSec?: number;
  hasAudio?: boolean;
};

type ApiMedia = {
  url?: string | null;
  quality?: string;
  extension?: string;
  videoAvailable?: boolean;
  audioAvailable?: boolean;
};

type ApiResult = {
  error?: string;
  title?: string;
  duration?: string | number | null;
  medias?: ApiMedia[];
};

let resolverQueue: Promise<void> = Promise.resolve();
let lastResolverAt = 0;

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function rateLimitResolver() {
  const delay = Math.max(
    3000,
    Math.min(30000, Number(process.env.VK_DOWNLOAD_RESOLVER_DELAY_MS || 4000)),
  );
  const run = resolverQueue.then(async () => {
    const wait = Math.max(0, lastResolverAt + delay - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastResolverAt = Date.now();
  });
  resolverQueue = run.catch(() => {});
  await run;
}

function calculateHash(videoUrl: string) {
  return `${Buffer.from(videoUrl).toString("base64")}${videoUrl.length + 1000}${Buffer.from("aio-dl").toString("base64")}`;
}

function parseDuration(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : undefined;
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function mediaScore(media: ApiMedia, preferredQuality: "720p" | "best") {
  const quality = media.quality || "";
  const height = Number(quality.match(/(\d{3,4})/)?.[1] || 0);
  let score = height;
  if ((media.extension || "").toLowerCase() === "mp4") score += 10000;
  if (media.videoAvailable !== false) score += 5000;
  if (media.audioAvailable !== false) score += 5000;
  else score -= 20000;
  if (preferredQuality === "720p" && height === 720) score += 50000;
  if (preferredQuality === "720p" && height > 720) score -= height;
  return score;
}

async function resolveAttempt(videoUrl: string, preferredQuality: "720p" | "best") {
  await rateLimitResolver();
  const getTimeout = timeoutSignal(30000);
  let page: Response;
  try {
    page = await fetch(`${SITE_URL}/`, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      cache: "no-store",
      signal: getTimeout.signal,
    });
  } finally {
    getTimeout.clear();
  }
  if (!page.ok) throw new Error("vkvideodownload.com временно недоступен");
  const html = await page.text();
  const token = html.match(/<input[^>]+id=["']token["'][^>]+value=["']([^"']+)["']/i)?.[1]
    || html.match(/<input[^>]+name=["']token["'][^>]+value=["']([^"']+)["']/i)?.[1];
  if (!token) throw new Error("vkvideodownload.com временно недоступен");

  const body = new URLSearchParams({ url: videoUrl, token, hash: calculateHash(videoUrl) });
  const postTimeout = timeoutSignal(60000);
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": USER_AGENT,
        accept: "application/json,text/plain,*/*",
        origin: SITE_URL,
        referer: `${SITE_URL}/`,
      },
      body,
      signal: postTimeout.signal,
    });
  } finally {
    postTimeout.clear();
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error("VK-видео не открывается без авторизации");
    throw new Error("vkvideodownload.com временно недоступен");
  }
  const result = (await response.json()) as ApiResult;
  if (result.error) {
    const lower = result.error.toLowerCase();
    if (lower.includes("private") || lower.includes("login") || lower.includes("author")) {
      throw new Error("VK-видео не открывается без авторизации");
    }
    throw new Error(result.error);
  }
  const candidates = (result.medias || [])
    .filter((media) => media.url && media.videoAvailable !== false && media.audioAvailable !== false)
    .sort((a, b) => mediaScore(b, preferredQuality) - mediaScore(a, preferredQuality));
  const selected = candidates[0];
  if (!selected?.url) throw new Error("vkvideodownload.com не вернул ссылку на MP4");
  if (preferredQuality === "720p" && !selected.quality?.includes("720")) {
    console.warn("Не найдена версия 720p, использована лучшая доступная");
  }
  return {
    sourceUrl: videoUrl,
    directUrl: new URL(selected.url, SITE_URL).toString(),
    quality: selected.quality,
    format: selected.extension || "mp4",
    title: result.title,
    durationSec: parseDuration(result.duration),
    hasAudio: selected.audioAvailable !== false,
  } satisfies VkVideoDownloadResolved;
}

export async function resolveWithVkVideoDownload(
  videoUrl: string,
  preferredQuality: "720p" | "best" = "720p",
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await resolveAttempt(videoUrl, preferredQuality);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("vkvideodownload.com временно недоступен");
}
