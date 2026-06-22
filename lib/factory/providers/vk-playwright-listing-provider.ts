import type { VkPlaywrightCookie } from "@/lib/factory/vk-cookies";
import type { VkSourceVideo } from "@/lib/factory/vk-auto-source";

export type VkPlaywrightListingDebug = {
  enabled: boolean;
  candidatesTried: Array<{ url: string; status?: number; foundCount: number; error?: string }>;
  networkMatches: number;
  domMatches: number;
  cookiesEnabled: boolean;
  error?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeProviderVideoId(value: string) {
  return value.replace(/^video/i, "").replace(/^\//, "");
}

function normalizeFoundVkVideoUrl(providerVideoId: string) {
  return `https://vk.com/video${normalizeProviderVideoId(providerVideoId)}`;
}

function decodeText(input: string) {
  let text = input;
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\\//g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function titleNear(text: string, position: number) {
  const slice = text.slice(Math.max(0, position - 1600), Math.min(text.length, position + 2400));
  const patterns = [
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,30})"/i,
    /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,30})"/i,
    /data-title=["']([^"']{4,180})["']/i,
    /aria-label=["']([^"']{4,180})["']/i,
    /title=["']([^"']{4,180})["']/i,
  ];
  for (const pattern of patterns) {
    const raw = slice.match(pattern)?.[1];
    if (!raw) continue;
    const title = decodeText(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (
      title &&
      title.length > 3 &&
      !/^video-?\d+_\d+$/i.test(title) &&
      !/^(главная|новые|популярное|подписки|плейлисты|клипы|vk|vk video|vk видео)$/i.test(title)
    ) {
      return title.slice(0, 180);
    }
  }
  return undefined;
}

function extractVideosFromText(text: string): VkSourceVideo[] {
  const normalizedText = decodeText(text);
  const matches: Array<{ id: string; index: number }> = [];
  const patterns = [
    /(?:https?:\/\/(?:m\.)?vk\.(?:com|ru))?\/?video(-?\d+_\d+)/gi,
    /(?:https?:\/\/vkvideo\.ru)?\/?video(-?\d+_\d+)/gi,
    /href=["'][^"']*video(-?\d+_\d+)/gi,
    /url\\?"\s*:\s*\\?"[^"\\]*video(-?\d+_\d+)/gi,
    /contentUrl\\?"\s*:\s*\\?"[^"\\]*video(-?\d+_\d+)/gi,
    /%2Fvideo(-?\d+_\d+)/gi,
    /\bvideo(-?\d+_\d+)\b/gi,
    /"video_id"\s*:\s*"?(-?\d+_\d+)"?/gi,
    /"id"\s*:\s*"?video(-?\d+_\d+)"?/gi,
    /data-video=["'](-?\d+_\d+)["']/gi,
    /"video"\s*:\s*"(-?\d+_\d+)"/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedText))) {
      if (match[1]) matches.push({ id: normalizeProviderVideoId(match[1]), index: match.index });
    }
  }

  const ownerIdPatterns: Array<{ pattern: RegExp; reversed?: boolean }> = [
    { pattern: /["']owner_id["']\s*:\s*(-?\d+)[\s\S]{0,700}?["']id["']\s*:\s*(\d+)/gi },
    { pattern: /["']ownerId["']\s*:\s*(-?\d+)[\s\S]{0,700}?["']id["']\s*:\s*(\d+)/gi },
    { pattern: /["']id["']\s*:\s*(\d+)[\s\S]{0,700}?["']owner_id["']\s*:\s*(-?\d+)/gi, reversed: true },
    { pattern: /["']id["']\s*:\s*(\d+)[\s\S]{0,700}?["']ownerId["']\s*:\s*(-?\d+)/gi, reversed: true },
  ];
  for (const { pattern, reversed } of ownerIdPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedText))) {
      const ownerId = reversed ? match[2] : match[1];
      const videoId = reversed ? match[1] : match[2];
      if (ownerId && videoId) matches.push({ id: `${ownerId}_${videoId}`, index: match.index });
    }
  }

  const unique = new Map<string, VkSourceVideo>();
  for (const match of matches) {
    if (!/^-?\d+_\d+$/.test(match.id)) continue;
    if (unique.has(match.id)) continue;
    unique.set(match.id, {
      providerVideoId: match.id,
      videoUrl: normalizeFoundVkVideoUrl(match.id),
      title: titleNear(normalizedText, match.index),
    });
  }

  return Array.from(unique.values());
}

function mergeVideos(target: Map<string, VkSourceVideo>, videos: VkSourceVideo[]) {
  for (const video of videos) {
    const id = video.providerVideoId || video.videoUrl.match(/video(-?\d+_\d+)/i)?.[1];
    const key = id || video.videoUrl;
    if (!target.has(key)) target.set(key, { ...video, providerVideoId: id || video.providerVideoId, videoUrl: id ? normalizeFoundVkVideoUrl(id) : video.videoUrl });
  }
}

function responseLooksReadable(contentType: string, url: string) {
  const lower = `${contentType} ${url}`.toLowerCase();
  return (
    lower.includes("text/html") ||
    lower.includes("json") ||
    lower.includes("javascript") ||
    lower.includes("vk.com") ||
    lower.includes("vk.ru") ||
    lower.includes("vkvideo.ru") ||
    lower.includes("video")
  );
}

export async function listVkVideosWithPlaywright(input: {
  sourceUrl: string;
  candidateUrls: string[];
  limit: number;
  cookies?: VkPlaywrightCookie[];
}): Promise<{ videos: VkSourceVideo[]; debug: VkPlaywrightListingDebug }> {
  const debug: VkPlaywrightListingDebug = {
    enabled: true,
    candidatesTried: [],
    networkMatches: 0,
    domMatches: 0,
    cookiesEnabled: Boolean(input.cookies?.length),
  };
  const found = new Map<string, VkSourceVideo>();
  const responseTasks = new Set<Promise<void>>();
  let browser: Awaited<ReturnType<typeof import("playwright")["chromium"]["launch"]>> | null = null;

  const flushResponseTasks = async () => {
    const tasks = Array.from(responseTasks);
    responseTasks.clear();
    if (tasks.length) await Promise.allSettled(tasks);
  };

  try {
    console.info("[VK_PLAYWRIGHT] launch", {
      headless: process.env.VK_LISTING_HEADLESS !== "false",
      candidateCount: input.candidateUrls.length,
      limit: input.limit,
    });

    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: process.env.VK_LISTING_HEADLESS !== "false" });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "ru-RU",
      viewport: { width: 1365, height: 900 },
    });

    console.info("[VK_PLAYWRIGHT] cookies", {
      enabled: Boolean(input.cookies?.length),
      count: input.cookies?.length || 0,
      domains: Array.from(new Set((input.cookies || []).map((cookie) => cookie.domain.replace(/^\./, "")))),
    });

    if (input.cookies?.length) await context.addCookies(input.cookies);
    const page = await context.newPage();

    page.on("response", (response) => {
      const task = (async () => {
        try {
          const headers = response.headers();
          if (!responseLooksReadable(headers["content-type"] || "", response.url())) return;
          const text = await response.text();
          const videos = extractVideosFromText(text);
          if (videos.length) {
            debug.networkMatches += videos.length;
            mergeVideos(found, videos);
            console.info("[VK_PLAYWRIGHT] network extracted", {
              url: response.url(),
              found: videos.length,
              totalFound: found.size,
            });
          }
        } catch {
          // Some VK responses are binary, compressed, streamed, CORS-protected, or already consumed.
        }
      })();
      responseTasks.add(task);
      task.finally(() => responseTasks.delete(task)).catch(() => undefined);
    });

    const waitMs = envInt("VK_LISTING_WAIT_MS", 6000);
    const scrollPages = Math.max(0, Math.min(20, envInt("VK_LISTING_SCROLL_PAGES", 6)));

    for (const url of input.candidateUrls) {
      const attempt = { url, status: undefined as number | undefined, foundCount: 0, error: undefined as string | undefined };
      debug.candidatesTried.push(attempt);
      try {
        console.info("[VK_PLAYWRIGHT] goto", { url });
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        attempt.status = response?.status();
        console.info("[VK_PLAYWRIGHT] loaded", { url, status: attempt.status });

        await page.waitForLoadState("networkidle", { timeout: waitMs }).catch(() => undefined);
        await page.waitForTimeout(waitMs);
        await flushResponseTasks();

        for (let index = 0; index < scrollPages; index += 1) {
          console.info("[VK_PLAYWRIGHT] scroll", { url, step: index + 1, total: scrollPages });
          await page.mouse.wheel(0, 2500);
          await page.waitForTimeout(1000);
          await flushResponseTasks();
        }

        const html = await page.content();
        const hrefs = await page.locator("a").evaluateAll((nodes) =>
          nodes.map((node) => [node.getAttribute("href"), node.getAttribute("aria-label"), node.getAttribute("title"), node.textContent].filter(Boolean).join(" ")),
        );
        const bodyText = await page.locator("body").evaluate((node) => node.textContent || "").catch(() => "");
        const domVideos = extractVideosFromText(`${html}\n${hrefs.join("\n")}\n${bodyText}`);
        debug.domMatches += domVideos.length;
        mergeVideos(found, domVideos);
        attempt.foundCount = found.size;

        console.info("[VK_PLAYWRIGHT] extracted", {
          url,
          domFound: domVideos.length,
          networkFound: debug.networkMatches,
          totalFound: found.size,
        });

        if (found.size >= input.limit) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown Playwright error");
        attempt.error = message.includes("Executable doesn't exist") || message.includes("browserType.launch")
          ? "Playwright listing включён, но Chromium не установлен. Нужно установить chromium через npx playwright install chromium."
          : message;
        console.warn("[VK_PLAYWRIGHT] candidate failed", { url, error: attempt.error });
      }
    }

    await flushResponseTasks();
    await context.close().catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown Playwright error");
    debug.error = message.includes("Executable doesn't exist") || message.includes("browserType.launch")
      ? "Playwright listing включён, но Chromium не установлен. Нужно установить chromium через npx playwright install chromium."
      : message;
    console.warn("[VK_PLAYWRIGHT] failed", { error: debug.error });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  const videos = Array.from(found.values()).slice(0, input.limit);
  console.info("[VK_PLAYWRIGHT] done", {
    totalFound: videos.length,
    domMatches: debug.domMatches,
    networkMatches: debug.networkMatches,
    error: debug.error,
  });
  return { videos, debug };
}
