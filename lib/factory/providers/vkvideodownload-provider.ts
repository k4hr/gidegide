const SITE_URL = "https://vkvideodownload.com";
const API_URL = `${SITE_URL}/wp-json/aio-dl/video-data/`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0 Safari/537.36";

export type VkVideoDownloadCandidate = {
  url: string;
  quality?: number;
  label?: string;
  ext?: string;
  sizeText?: string;
  source: "api" | "html" | "playwright";
  headers?: Record<string, string>;
};

export type VkVideoDownloadResolved = {
  sourceUrl: string;
  directUrl: string;
  quality?: string;
  format?: string;
  title?: string;
  durationSec?: number;
  hasAudio?: boolean;
  candidate?: VkVideoDownloadCandidate;
};

type ApiMedia = {
  url?: string | null;
  quality?: string | number | null;
  extension?: string | null;
  ext?: string | null;
  type?: string | null;
  size?: string | number | null;
  formattedSize?: string | null;
  sizeText?: string | null;
  videoAvailable?: boolean;
  audioAvailable?: boolean;
};

type ApiResult = {
  error?: string;
  title?: string;
  duration?: string | number | null;
  medias?: ApiMedia[];
  data?: unknown;
  result?: unknown;
};

export type VkVideoDownloadCandidatesResult = {
  title?: string;
  durationSec?: number;
  candidates: VkVideoDownloadCandidate[];
  debug: {
    apiTried: boolean;
    htmlTried: boolean;
    playwrightTried: boolean;
    foundCount: number;
    errors: string[];
  };
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

function normalizeUrl(value: string) {
  const cleaned = value
    .trim()
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\\u0026/g, "&")
    .replace(/^['"]|['"]$/g, "");

  try {
    return new URL(cleaned, SITE_URL).toString();
  } catch {
    return null;
  }
}

function parseQuality(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    const text = String(value ?? "");
    const match = text.match(/(?:^|[^\d])([1-9]\d{2,3})\s*p(?:[^\d]|$)/i) || text.match(/(?:^|[^\d])([1-9]\d{2,3})(?:[^\d]|$)/);
    const quality = Number(match?.[1] || 0);
    if (Number.isFinite(quality) && quality >= 144 && quality <= 4320) return quality;
  }

  return undefined;
}

function inferExt(url: string, ...values: Array<string | number | null | undefined>) {
  const combined = `${url} ${values.map((value) => String(value ?? "")).join(" ")}`.toLowerCase();
  if (combined.includes(".mp4") || /\bmp4\b/.test(combined)) return "mp4";
  return String(values.find((value) => /mp4/i.test(String(value ?? ""))) ?? "mp4").toLowerCase();
}

function looksLikeDownloadableVideoUrl(url: string, ext?: string) {
  const lower = url.toLowerCase();
  if ((ext || "").toLowerCase() === "mp4") return true;
  if (lower.includes(".mp4")) return true;
  if (lower.includes("video") && lower.startsWith("http")) return true;
  if (lower.includes("download") && lower.startsWith("http")) return true;
  return false;
}

function getSetCookieHeaders(headers: Headers) {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === "function") return withGetSetCookie.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeCookieHeader(existing: string | undefined, setCookieHeaders: string[]) {
  const cookieMap = new Map<string, string>();

  for (const part of (existing || "").split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name && valueParts.length) cookieMap.set(name, valueParts.join("="));
  }

  for (const setCookie of setCookieHeaders) {
    const [cookiePair] = setCookie.split(";");
    const [name, ...valueParts] = cookiePair.trim().split("=");
    if (name && valueParts.length) cookieMap.set(name, valueParts.join("="));
  }

  return [...cookieMap.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function baseHeaders(cookieHeader?: string): Record<string, string> {
  return {
    "user-agent": USER_AGENT,
    accept: "video/mp4,video/*,*/*",
    referer: `${SITE_URL}/`,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}

function addCandidate(input: {
  target: VkVideoDownloadCandidate[];
  url?: string | null;
  quality?: string | number | null;
  label?: string | number | null;
  ext?: string | null;
  sizeText?: string | number | null;
  source: VkVideoDownloadCandidate["source"];
  cookieHeader?: string;
}) {
  if (!input.url) return;
  const url = normalizeUrl(input.url);
  if (!url) return;

  const label = [input.label, input.quality, input.sizeText].filter(Boolean).join(" ").trim() || undefined;
  const ext = inferExt(url, input.ext, input.label, input.quality);

  if (!looksLikeDownloadableVideoUrl(url, ext)) return;

  input.target.push({
    url,
    quality: parseQuality(input.quality, input.label, url),
    label,
    ext,
    sizeText: input.sizeText == null ? undefined : String(input.sizeText),
    source: input.source,
    headers: baseHeaders(input.cookieHeader),
  });
}

function extractCandidatesFromUnknown(input: {
  value: unknown;
  target: VkVideoDownloadCandidate[];
  source: VkVideoDownloadCandidate["source"];
  cookieHeader?: string;
  contextLabel?: string;
  depth?: number;
}) {
  const depth = input.depth ?? 0;
  if (depth > 8 || input.value == null) return;

  if (Array.isArray(input.value)) {
    input.value.forEach((item) => extractCandidatesFromUnknown({ ...input, value: item, depth: depth + 1 }));
    return;
  }

  if (typeof input.value === "object") {
    const record = input.value as Record<string, unknown>;
    const urlValue = record.url || record.href || record.link || record.downloadUrl || record.download_url || record.src;

    if (typeof urlValue === "string") {
      addCandidate({
        target: input.target,
        url: urlValue,
        quality: record.quality as string | number | null | undefined,
        label: (record.label || record.name || record.text || record.title || input.contextLabel) as string | number | null | undefined,
        ext: (record.extension || record.ext || record.format || record.type) as string | null | undefined,
        sizeText: (record.formattedSize || record.sizeText || record.size || record.filesize) as string | number | null | undefined,
        source: input.source,
        cookieHeader: input.cookieHeader,
      });
    }

    for (const [key, value] of Object.entries(record)) {
      extractCandidatesFromUnknown({
        ...input,
        value,
        contextLabel: /quality|label|title|name/i.test(key) ? String(value ?? input.contextLabel ?? "") : input.contextLabel,
        depth: depth + 1,
      });
    }
    return;
  }

  if (typeof input.value !== "string") return;

  const text = input.value;
  const urlMatches = text.match(/https?:\\?\/\\?\/[^\s"'<>\\]+/gi) || [];
  for (const rawUrl of urlMatches) {
    addCandidate({
      target: input.target,
      url: rawUrl,
      label: input.contextLabel || text.slice(0, 160),
      source: input.source,
      cookieHeader: input.cookieHeader,
    });
  }
}

function extractCandidatesFromHtml(html: string, cookieHeader?: string, source: VkVideoDownloadCandidate["source"] = "html") {
  const candidates: VkVideoDownloadCandidate[] = [];

  const anchorRegex = /<a\b[^>]*(?:href|data-url|data-href)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const tagAndText = `${match[0]} ${match[2].replace(/<[^>]+>/g, " ")}`;
    addCandidate({
      target: candidates,
      url: match[1],
      label: tagAndText,
      quality: tagAndText,
      ext: tagAndText,
      sizeText: tagAndText.match(/\(([^)]*(?:МБ|MB|ГБ|GB)[^)]*)\)/i)?.[1],
      source,
      cookieHeader,
    });
  }

  const attrRegex = /(?:href|data-url|data-href|url|src)["']?\s*[:=]\s*["']([^"']+(?:mp4|download|video)[^"']*)["']/gi;
  for (const match of html.matchAll(attrRegex)) {
    const before = html.slice(Math.max(0, match.index - 180), Math.min(html.length, match.index + 360));
    addCandidate({
      target: candidates,
      url: match[1],
      label: before,
      quality: before,
      ext: before,
      sizeText: before.match(/\(([^)]*(?:МБ|MB|ГБ|GB)[^)]*)\)/i)?.[1],
      source,
      cookieHeader,
    });
  }

  extractCandidatesFromUnknown({ value: html, target: candidates, source, cookieHeader });

  return candidates;
}

function dedupeCandidates(candidates: VkVideoDownloadCandidate[]) {
  const map = new Map<string, VkVideoDownloadCandidate>();

  for (const candidate of candidates) {
    const key = candidate.url;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, candidate);
      continue;
    }

    map.set(key, {
      ...existing,
      quality: existing.quality || candidate.quality,
      label: existing.label || candidate.label,
      ext: existing.ext || candidate.ext,
      sizeText: existing.sizeText || candidate.sizeText,
      headers: { ...(candidate.headers || {}), ...(existing.headers || {}) },
    });
  }

  return [...map.values()];
}

function targetQuality(preferredQuality: "720p" | "best") {
  if (preferredQuality === "best") return null;
  return Number(process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.match(/(\d{3,4})/)?.[1] || 720);
}

export function rankVkVideoDownloadCandidates(
  candidates: VkVideoDownloadCandidate[],
  preferredQuality: "720p" | "best" = "720p",
) {
  const preferred = targetQuality(preferredQuality);
  const order = preferred ? [preferred, 1080, 480, 360, 240] : [2160, 1440, 1080, 720, 480, 360, 240];

  return [...candidates].sort((a, b) => {
    const aQuality = a.quality || 0;
    const bQuality = b.quality || 0;
    const aMp4 = (a.ext || "").toLowerCase().includes("mp4") || a.url.toLowerCase().includes(".mp4");
    const bMp4 = (b.ext || "").toLowerCase().includes("mp4") || b.url.toLowerCase().includes(".mp4");
    const aOrder = order.includes(aQuality) ? order.indexOf(aQuality) : order.length;
    const bOrder = order.includes(bQuality) ? order.indexOf(bQuality) : order.length;
    const aScore = (aMp4 ? 100000 : 0) - aOrder * 1000 + aQuality;
    const bScore = (bMp4 ? 100000 : 0) - bOrder * 1000 + bQuality;
    return bScore - aScore;
  });
}

async function resolveViaApi(videoUrl: string, cookieHeader?: string) {
  const result: {
    title?: string;
    durationSec?: number;
    cookieHeader?: string;
    candidates: VkVideoDownloadCandidate[];
  } = { candidates: [], cookieHeader };

  const getTimeout = timeoutSignal(30000);
  let page: Response;
  try {
    console.log("[VKVD] open");
    page = await fetch(`${SITE_URL}/`, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*", ...(cookieHeader ? { cookie: cookieHeader } : {}) },
      cache: "no-store",
      signal: getTimeout.signal,
    });
  } finally {
    getTimeout.clear();
  }

  result.cookieHeader = mergeCookieHeader(cookieHeader, getSetCookieHeaders(page.headers));
  if (!page.ok) throw new Error("vkvideodownload.com временно недоступен");

  const html = await page.text();
  const token = html.match(/<input[^>]+id=["']token["'][^>]+value=["']([^"']+)["']/i)?.[1]
    || html.match(/<input[^>]+name=["']token["'][^>]+value=["']([^"']+)["']/i)?.[1]
    || html.match(/["']token["']\s*[:=]\s*["']([^"']+)["']/i)?.[1];
  if (!token) throw new Error("vkvideodownload.com не вернул token");

  result.candidates.push(...extractCandidatesFromHtml(html, result.cookieHeader));

  console.log("[VKVD] api request");
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
        ...(result.cookieHeader ? { cookie: result.cookieHeader } : {}),
      },
      body,
      signal: postTimeout.signal,
    });
  } finally {
    postTimeout.clear();
  }

  result.cookieHeader = mergeCookieHeader(result.cookieHeader, getSetCookieHeaders(response.headers));
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error("VK-видео не открывается без авторизации");
    throw new Error("vkvideodownload.com временно недоступен");
  }

  const rawText = await response.text();
  let apiResult: ApiResult;
  try {
    apiResult = JSON.parse(rawText) as ApiResult;
  } catch {
    apiResult = {};
    result.candidates.push(...extractCandidatesFromHtml(rawText, result.cookieHeader));
  }

  if (apiResult.error) {
    const lower = apiResult.error.toLowerCase();
    if (lower.includes("private") || lower.includes("login") || lower.includes("author")) {
      throw new Error("VK-видео не открывается без авторизации");
    }
    throw new Error(apiResult.error);
  }

  result.title = apiResult.title;
  result.durationSec = parseDuration(apiResult.duration);

  const apiCandidates: VkVideoDownloadCandidate[] = [];
  extractCandidatesFromUnknown({ value: apiResult, target: apiCandidates, source: "api", cookieHeader: result.cookieHeader });

  if (apiResult.medias?.length) {
    for (const media of apiResult.medias) {
      addCandidate({
        target: apiCandidates,
        url: media.url,
        quality: media.quality,
        label: media.quality,
        ext: media.extension || media.ext || media.type,
        sizeText: media.formattedSize || media.sizeText || media.size,
        source: "api",
        cookieHeader: result.cookieHeader,
      });
    }
  }

  result.candidates.push(...apiCandidates);
  console.log("[VKVD] api candidates", { count: apiCandidates.length });
  return result;
}

async function resolveViaPlaywright(videoUrl: string) {
  const candidates: VkVideoDownloadCandidate[] = [];
  const responseUrls: string[] = [];
  const browserFallback = process.env.VK_DOWNLOAD_BROWSER_FALLBACK?.toLowerCase() !== "false";
  if (!browserFallback) return candidates;

  let chromium: typeof import("playwright").chromium;
  try {
    chromium = (await import("playwright")).chromium;
  } catch (error) {
    throw new Error(`Playwright fallback недоступен: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
  }

  console.log("[VKVD] playwright submit");
  const browser = await chromium.launch({ headless: process.env.VK_LISTING_HEADLESS?.toLowerCase() !== "false" });
  try {
    const context = await browser.newContext({ userAgent: USER_AGENT, acceptDownloads: false });
    const page = await context.newPage();

    page.on("request", (request) => {
      const url = request.url();
      responseUrls.push(url);
      addCandidate({ target: candidates, url, label: url, source: "playwright" });
    });
    page.on("response", async (response) => {
      const url = response.url();
      responseUrls.push(url);
      addCandidate({ target: candidates, url, label: url, source: "playwright" });
      const contentType = response.headers()["content-type"] || "";
      if (/json|html|text|javascript/i.test(contentType)) {
        try {
          const text = await response.text();
          candidates.push(...extractCandidatesFromHtml(text, undefined, "playwright"));
          try {
            extractCandidatesFromUnknown({ value: JSON.parse(text) as unknown, target: candidates, source: "playwright" });
          } catch {
            // response was not JSON
          }
        } catch {
          // ignore unreadable response bodies
        }
      }
    });

    await page.goto(`${SITE_URL}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    const input = page.locator('input[type="url"], input[name="url"], input#url, textarea').first();
    await input.fill(videoUrl, { timeout: 15000 });
    const button = page.locator('button:has-text("Скачать"), button:has-text("Download"), input[type="submit"], button[type="submit"], .btn').first();
    await button.click({ timeout: 15000 });
    await page.waitForTimeout(Math.max(3000, Number(process.env.VK_DOWNLOAD_RESOLVER_DELAY_MS || 4000)));

    for (let step = 0; step < 4; step += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1000);
    }

    const html = await page.content();
    candidates.push(...extractCandidatesFromHtml(html, undefined, "playwright"));
  } finally {
    await browser.close().catch(() => undefined);
  }

  console.log("[VKVD] playwright candidates", { count: candidates.length, networkUrls: responseUrls.length });
  return candidates;
}

export async function resolveVkVideoDownloadCandidates(input: {
  sourceUrl: string;
}): Promise<VkVideoDownloadCandidatesResult> {
  await rateLimitResolver();

  const debug: VkVideoDownloadCandidatesResult["debug"] = {
    apiTried: false,
    htmlTried: false,
    playwrightTried: false,
    foundCount: 0,
    errors: [],
  };

  let title: string | undefined;
  let durationSec: number | undefined;
  let cookieHeader: string | undefined;
  const candidates: VkVideoDownloadCandidate[] = [];

  try {
    debug.apiTried = true;
    debug.htmlTried = true;
    const apiResult = await resolveViaApi(input.sourceUrl, cookieHeader);
    title = apiResult.title;
    durationSec = apiResult.durationSec;
    cookieHeader = apiResult.cookieHeader;
    candidates.push(...apiResult.candidates);
  } catch (error) {
    debug.errors.push(`api/html: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
  }

  let uniqueCandidates = dedupeCandidates(candidates);
  console.log("[VKVD] html candidates", { count: uniqueCandidates.filter((candidate) => candidate.source === "html").length });

  if (!uniqueCandidates.length) {
    try {
      debug.playwrightTried = true;
      candidates.push(...await resolveViaPlaywright(input.sourceUrl));
    } catch (error) {
      debug.errors.push(`playwright: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
    }
  }

  uniqueCandidates = dedupeCandidates(candidates).map((candidate) => ({
    ...candidate,
    headers: candidate.headers || baseHeaders(cookieHeader),
  }));

  debug.foundCount = uniqueCandidates.length;
  console.log(
    "[VKVD] candidates",
    rankVkVideoDownloadCandidates(uniqueCandidates).map((candidate) => ({
      quality: candidate.quality,
      label: candidate.label,
      sizeText: candidate.sizeText,
      source: candidate.source,
      urlPreview: candidate.url.slice(0, 110),
    })),
  );

  return {
    title,
    durationSec,
    candidates: uniqueCandidates,
    debug,
  };
}

export async function resolveWithVkVideoDownload(
  videoUrl: string,
  preferredQuality: "720p" | "best" = "720p",
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const result = await resolveVkVideoDownloadCandidates({ sourceUrl: videoUrl });
      const selected = rankVkVideoDownloadCandidates(result.candidates, preferredQuality)[0];
      if (!selected) throw new Error("vkvideodownload не вернул MP4-кандидаты");
      return {
        sourceUrl: videoUrl,
        directUrl: selected.url,
        quality: selected.quality ? `${selected.quality}p` : selected.label,
        format: selected.ext || "mp4",
        title: result.title,
        durationSec: result.durationSec,
        hasAudio: undefined,
        candidate: selected,
      } satisfies VkVideoDownloadResolved;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("vkvideodownload.com временно недоступен");
}
