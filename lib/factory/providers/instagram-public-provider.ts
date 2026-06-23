import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

import { INSTAGRAM_CONFIG } from "../instagram-config";
import { isInstagramRateLimitError } from "../instagram-errors";
import { getInstagramCookiesFilePath, readInstagramCookiesText } from "../instagram-secrets";
import { readCommand, runCommand, safeFileName } from "../video";

export type InstagramPublicVideo = {
  sourceUrl: string;
  shortcode?: string;
  username?: string;
  caption?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  mediaUrl?: string;
  publishedAt?: Date;
};

type NormalizedInstagramSource = {
  sourceUrl: string;
  username?: string;
  kind: "profile" | "reel" | "post";
};

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const INSTAGRAM_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";

function cleanFirstUrl(value: string) {
  return (value.match(/https?:\/\/[^\s<>]+/i)?.[0] || value.trim()).replace(/[),.!?]+$/, "");
}

function stripAt(value: string) {
  return value.trim().replace(/^@+/, "").replace(/\/+$/, "");
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanCaption(value?: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = decodeHtml(value).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  return cleaned ? cleaned.slice(0, 4500) : undefined;
}

function shortcodeFromUrl(value: string) {
  try {
    const url = new URL(cleanFirstUrl(value));
    const match = url.pathname.match(/\/(?:reel|p|tv)\/([^/?#]+)/i);
    return match?.[1];
  } catch {
    return value.match(/instagram\.com\/(?:reel|p|tv)\/([^/?#\s]+)/i)?.[1];
  }
}

function normalizeReelUrl(shortcode: string) {
  return `https://www.instagram.com/reel/${shortcode}/`;
}

function normalizePostUrl(shortcode: string) {
  return `https://www.instagram.com/p/${shortcode}/`;
}

function parseUploadDate(value?: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value !== "string") return undefined;
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    return new Date(Date.UTC(year, month - 1, day));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function isInstagramProfileOrPostText(text: string) {
  const urls = extractInstagramSourceUrls(text);
  if (urls.length > 0) return true;
  const value = stripAt(text);
  return /^[a-zA-Z0-9._]{2,30}$/.test(value);
}

export function extractInstagramSourceUrls(text: string) {
  const urls = new Set<string>();
  const matches = text.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s<>]+/gi) || [];
  for (const raw of matches) {
    try {
      const normalized = normalizeInstagramSourceUrl(raw);
      urls.add(normalized.sourceUrl);
    } catch {
      // ignore non-source links
    }
  }

  const accountMatches = text.match(/(^|\s)@[a-zA-Z0-9._]{2,30}\b/g) || [];
  for (const match of accountMatches) {
    const username = stripAt(match.trim());
    if (username) urls.add(`https://www.instagram.com/${username}/`);
  }

  return Array.from(urls);
}

export function normalizeInstagramSourceUrl(input: string): NormalizedInstagramSource {
  const value = cleanFirstUrl(input);

  if (/^@?[a-zA-Z0-9._]{2,30}$/.test(value.trim())) {
    const username = stripAt(value);
    return {
      sourceUrl: `https://www.instagram.com/${username}/`,
      username,
      kind: "profile",
    };
  }

  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^m\./, "www.");
  if (!INSTAGRAM_HOSTS.has(host)) throw new Error("Это не Instagram-ссылка");

  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0]?.toLowerCase();
  const code = parts[1];

  if ((first === "reel" || first === "p" || first === "tv") && code) {
    return {
      sourceUrl: first === "p" ? normalizePostUrl(code) : normalizeReelUrl(code),
      shortcode: code,
      kind: first === "p" ? "post" : "reel",
    } as NormalizedInstagramSource & { shortcode?: string };
  }

  const username = parts[0] ? stripAt(parts[0]) : undefined;
  if (!username || username === "reels" || username === "explore") {
    throw new Error("Instagram-источник не распознан");
  }

  return {
    sourceUrl: `https://www.instagram.com/${username}/`,
    username,
    kind: "profile",
  };
}

function parseYtDlpJsonLines(stdout: string) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const result: any[] = [];
  for (const line of lines) {
    try {
      result.push(JSON.parse(line));
    } catch {
      // ignore non-json output
    }
  }
  return result;
}

function videoFromYtDlpEntry(entry: any, fallbackUsername?: string): InstagramPublicVideo | null {
  const rawUrl = typeof entry.webpage_url === "string" ? entry.webpage_url : typeof entry.url === "string" ? entry.url : undefined;
  const shortcode = typeof entry.id === "string" && !entry.id.includes("/") ? entry.id : rawUrl ? shortcodeFromUrl(rawUrl) : undefined;
  const sourceUrl = rawUrl && rawUrl.includes("instagram.com") ? rawUrl : shortcode ? normalizeReelUrl(shortcode) : undefined;
  if (!sourceUrl) return null;

  return {
    sourceUrl,
    shortcode,
    username: typeof entry.uploader_id === "string" ? entry.uploader_id : fallbackUsername,
    caption: cleanCaption(entry.description || entry.title || entry.fulltitle),
    thumbnailUrl: typeof entry.thumbnail === "string" ? entry.thumbnail : undefined,
    durationSeconds: Number.isFinite(Number(entry.duration)) ? Math.round(Number(entry.duration)) : undefined,
    width: Number.isFinite(Number(entry.width)) ? Number(entry.width) : undefined,
    height: Number.isFinite(Number(entry.height)) ? Number(entry.height) : undefined,
    mediaUrl: typeof entry.url === "string" && /^https?:\/\//.test(entry.url) ? entry.url : undefined,
    publishedAt: parseUploadDate(entry.timestamp) || parseUploadDate(entry.release_timestamp) || parseUploadDate(entry.upload_date),
  };
}

async function ytdlpCookieArgs() {
  const cookiesFile = await getInstagramCookiesFilePath();
  return cookiesFile ? ["--cookies", cookiesFile] : [];
}

async function listWithYtDlp(sourceUrl: string, username?: string, limit = 50) {
  const args = [
    "--dump-json",
    "--flat-playlist",
    "--playlist-end",
    String(Math.max(1, Math.min(200, limit))),
    "--no-warnings",
    "--ignore-errors",
    ...(await ytdlpCookieArgs()),
    sourceUrl,
  ];
  const stdout = await readCommand("yt-dlp", args);
  const entries = parseYtDlpJsonLines(stdout);
  return entries.map((entry) => videoFromYtDlpEntry(entry, username)).filter(Boolean) as InstagramPublicVideo[];
}

async function enrichDirectWithYtDlp(sourceUrl: string, username?: string) {
  const stdout = await readCommand("yt-dlp", ["--dump-json", "--no-warnings", ...(await ytdlpCookieArgs()), sourceUrl]);
  const first = parseYtDlpJsonLines(stdout)[0];
  return first ? videoFromYtDlpEntry(first, username) : null;
}

type ParsedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
};

function parseNetscapeCookies(text: string): ParsedCookie[] {
  const cookies: ParsedCookie[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_"))) continue;
    const httpOnly = line.startsWith("#HttpOnly_");
    const cleanLine = httpOnly ? line.replace(/^#HttpOnly_/, "") : line;
    const parts = cleanLine.split("\t");
    if (parts.length < 7) continue;
    const [domain, , cookiePath, secureRaw, expiresRaw, name, ...valueParts] = parts;
    if (!domain.includes("instagram.com") || !name) continue;
    const expires = Number(expiresRaw);
    cookies.push({
      name,
      value: valueParts.join("\t"),
      domain: domain.startsWith(".") ? domain : `.${domain}`,
      path: cookiePath || "/",
      secure: secureRaw.toUpperCase() === "TRUE",
      httpOnly,
      ...(Number.isFinite(expires) && expires > 0 ? { expires } : {}),
    });
  }
  return cookies;
}

function looksLikeInstagramGate(text: string) {
  const lower = text.toLowerCase();
  return (
    lower.includes("too many requests") ||
    lower.includes("please wait a few minutes") ||
    lower.includes("challenge_required") ||
    lower.includes("login required") ||
    lower.includes("log in to see photos and videos") ||
    lower.includes("log in to instagram") ||
    lower.includes("sign up to see photos")
  );
}

async function listWithPlaywright(sourceUrl: string, username?: string, limit = 50) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: INSTAGRAM_USER_AGENT,
      locale: "en-US",
      viewport: { width: 1365, height: 900 },
    });

    const cookiesText = await readInstagramCookiesText();
    const cookies = cookiesText ? parseNetscapeCookies(cookiesText) : [];
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: INSTAGRAM_CONFIG.requestTimeoutMs });
    if (response?.status() === 429) throw new Error("Instagram 429 Too Many Requests");
    await page.waitForTimeout(2500);

    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    if (looksLikeInstagramGate(bodyText)) {
      throw new Error(cookies.length > 0 ? "Instagram login required or challenge_required" : "Instagram login required: add cookies with /set_instagram_cookies");
    }

    const found = new Set<string>();
    for (let step = 0; step < 8 && found.size < limit; step += 1) {
      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"],a[href*="/p/"]'))
          .map((a) => a.href)
          .filter(Boolean),
      );
      for (const link of links) {
        const shortcode = link.match(/\/(?:reel|p)\/([^/?#]+)/i)?.[1];
        if (shortcode) found.add(link.includes("/p/") ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/reel/${shortcode}/`);
      }
      if (found.size >= limit) break;
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(1200);
    }

    return Array.from(found).slice(0, limit).map((url) => ({
      sourceUrl: url,
      shortcode: shortcodeFromUrl(url),
      username,
    }));
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function listInstagramPublicVideos(input: {
  sourceUrl: string;
  username?: string;
  limit?: number;
}): Promise<InstagramPublicVideo[]> {
  const normalized = normalizeInstagramSourceUrl(input.sourceUrl);
  const limit = input.limit ?? INSTAGRAM_CONFIG.listLimit;
  const username = input.username || normalized.username;
  console.log("[INSTAGRAM] list start", { sourceUrl: normalized.sourceUrl, kind: normalized.kind, limit });

  if (normalized.kind !== "profile") {
    try {
      const direct = await enrichDirectWithYtDlp(normalized.sourceUrl, username);
      if (direct) return [direct];
    } catch (error) {
      if (isInstagramRateLimitError(error)) throw error;
      console.warn("[INSTAGRAM] direct yt-dlp failed", error instanceof Error ? error.message : error);
    }
    return [{ sourceUrl: normalized.sourceUrl, shortcode: shortcodeFromUrl(normalized.sourceUrl), username }];
  }

  const candidates: InstagramPublicVideo[] = [];

  try {
    console.log("[INSTAGRAM] playwright list start", { sourceUrl: normalized.sourceUrl });
    candidates.push(...(await listWithPlaywright(normalized.sourceUrl, username, limit)));
  } catch (error) {
    if (isInstagramRateLimitError(error)) throw error;
    console.warn("[INSTAGRAM] playwright list failed", error instanceof Error ? error.message : error);
  }

  if (candidates.length < 1 && INSTAGRAM_CONFIG.enableYtdlpProfileList) {
    const listUrls = [`https://www.instagram.com/${username}/reels/`, normalized.sourceUrl];
    for (const url of listUrls) {
      try {
        console.log("[INSTAGRAM] yt-dlp list start", { url });
        candidates.push(...(await listWithYtDlp(url, username, limit)));
        if (candidates.length >= limit) break;
      } catch (error) {
        if (isInstagramRateLimitError(error)) throw error;
        console.warn("[INSTAGRAM] yt-dlp list failed", error instanceof Error ? error.message : error);
      }
    }
  }

  const unique = new Map<string, InstagramPublicVideo>();
  for (const candidate of candidates) {
    const key = candidate.shortcode || candidate.sourceUrl;
    if (!unique.has(key)) unique.set(key, candidate);
  }

  const result = Array.from(unique.values()).slice(0, limit);
  console.log("[INSTAGRAM] public videos found", { count: result.length });
  return result;
}

export async function downloadInstagramPublicVideo(input: {
  sourceUrl: string;
  outputDir: string;
}): Promise<{
  filePath: string;
  caption?: string;
  shortcode?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
}> {
  await fs.promises.mkdir(input.outputDir, { recursive: true });
  const normalized = normalizeInstagramSourceUrl(input.sourceUrl);
  const shortcode = shortcodeFromUrl(normalized.sourceUrl) || safeFileName(normalized.sourceUrl).slice(0, 40) || String(Date.now());
  const outputTemplate = path.join(input.outputDir, `${safeFileName(shortcode)}.%(ext)s`);

  console.log("[INSTAGRAM] download start", { sourceUrl: normalized.sourceUrl, shortcode });

  let meta: InstagramPublicVideo | null = null;
  try {
    meta = await enrichDirectWithYtDlp(normalized.sourceUrl, normalized.username);
  } catch (error) {
    if (isInstagramRateLimitError(error)) throw error;
    console.warn("[INSTAGRAM] metadata yt-dlp failed", error instanceof Error ? error.message : error);
  }

  await runCommand(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      ...(await ytdlpCookieArgs()),
      "--merge-output-format",
      "mp4",
      "-f",
      "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
      "-o",
      outputTemplate,
      normalized.sourceUrl,
    ],
    { logPrefix: "INSTAGRAM-DOWNLOAD" },
  );

  const files = (await fs.promises.readdir(input.outputDir))
    .filter((name) => name.startsWith(safeFileName(shortcode)) && /\.(mp4|mov|m4v)$/i.test(name))
    .map((name) => path.join(input.outputDir, name));
  const filePath = files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Instagram Reel не скачался в MP4");

  const stat = await fs.promises.stat(filePath);
  if (stat.size < 1024 * 512) throw new Error("Instagram Reel скачался слишком маленьким файлом");

  console.log("[INSTAGRAM] downloaded", { filePath, sizeBytes: stat.size });

  return {
    filePath,
    caption: meta?.caption,
    shortcode: meta?.shortcode || shortcode,
    durationSeconds: meta?.durationSeconds,
    width: meta?.width,
    height: meta?.height,
    sizeBytes: stat.size,
  };
}
