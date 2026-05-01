import path from "node:path";
import { chromium, type Page } from "playwright";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { runCommand } from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

type DownloadViaRipYoutubeInput = {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
};

type LinkCandidate = {
  href: string;
  text: string;
  score: number;
};

function getYoutubeVideoId(url: string) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.toLowerCase();

  if (host === "youtu.be") {
    return parsedUrl.pathname.replace("/", "").trim();
  }

  const searchVideoId = parsedUrl.searchParams.get("v");

  if (searchVideoId) {
    return searchVideoId;
  }

  const shortsMatch = parsedUrl.pathname.match(/\/shorts\/([^/?#]+)/);

  if (shortsMatch?.[1]) {
    return shortsMatch[1];
  }

  return null;
}

export function isYoutubeUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname.toLowerCase();

    return (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtu.be" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

export function buildRipYoutubeUrl(youtubeUrl: string) {
  const videoId = getYoutubeVideoId(youtubeUrl);

  if (videoId) {
    return `https://www.ripyoutube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  const parsedUrl = new URL(youtubeUrl);
  parsedUrl.hostname = "www.ripyoutube.com";

  return parsedUrl.toString();
}

async function assertNotCanceled(isCanceled?: CancelCheck) {
  if (await isCanceled?.()) {
    throw new Error("Задача отменена пользователем");
  }
}

function isBadHref(href: string) {
  const lower = href.toLowerCase();

  return (
    !href ||
    href.startsWith("javascript:") ||
    href.startsWith("#") ||
    lower.includes("facebook.com") ||
    lower.includes("twitter.com") ||
    lower.includes("telegram") ||
    lower.includes("whatsapp") ||
    lower.includes("mailto:") ||
    lower.includes("chrome-extension")
  );
}

function scoreDownloadLink(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();

  let score = 0;

  if (value.includes("download")) score += 40;
  if (value.includes("mp4")) score += 35;
  if (value.includes("720")) score += 30;
  if (value.includes("480")) score += 20;
  if (value.includes("360")) score += 10;
  if (value.includes("video")) score += 8;
  if (value.includes("genyoutube")) score += 8;
  if (value.includes("/mates/")) score += 8;
  if (value.includes("quality")) score += 6;

  if (value.includes("mp3")) score -= 70;
  if (value.includes("audio")) score -= 30;
  if (value.includes("advert")) score -= 40;
  if (value.includes("adclick")) score -= 40;

  return score;
}

async function getBestDownloadLink(page: Page) {
  const candidates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map((link) => {
        const anchor = link as HTMLAnchorElement;

        return {
          href: anchor.href,
          text: anchor.innerText || anchor.textContent || "",
        };
      })
      .filter((item) => item.href);
  });

  const scored: LinkCandidate[] = candidates
    .filter((item) => !isBadHref(item.href))
    .map((item) => ({
      ...item,
      score: scoreDownloadLink(item.text, item.href),
    }))
    .filter((item) => item.score > 25)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

async function clickBestButton(page: Page) {
  const clickable = page.locator("a, button, input[type='button'], input[type='submit']");
  const count = await clickable.count();

  const candidates: Array<{
    index: number;
    text: string;
    score: number;
  }> = [];

  for (let index = 0; index < Math.min(count, 120); index += 1) {
    const item = clickable.nth(index);

    try {
      if (!(await item.isVisible())) continue;

      const text =
        (await item.innerText().catch(() => "")) ||
        (await item.getAttribute("value").catch(() => "")) ||
        (await item.getAttribute("title").catch(() => "")) ||
        (await item.getAttribute("aria-label").catch(() => "")) ||
        "";

      const href = (await item.getAttribute("href").catch(() => "")) || "";
      const score = scoreDownloadLink(text, href);

      if (score <= 0) continue;

      candidates.push({
        index,
        text,
        score,
      });
    } catch {
      // ignore broken nodes
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];

  if (!best) {
    return false;
  }

  await clickable.nth(best.index).click({
    timeout: 15000,
    force: true,
  });

  return true;
}

async function downloadHrefToFile(input: {
  href: string;
  outputPath: string;
  isCanceled?: CancelCheck;
}) {
  await runCommand(
    "curl",
    [
      "-L",
      "--fail",
      "--show-error",
      "--connect-timeout",
      "30",
      "--retry",
      "3",
      "--retry-delay",
      "2",
      "-A",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0 Safari/537.36",
      "-H",
      "Accept: video/mp4,video/*,*/*",
      "-o",
      input.outputPath,
      input.href,
    ],
    {
      logPrefix: "rip-curl",
      isCanceled: input.isCanceled,
    },
  );
}

export async function downloadViaRipYoutube(input: DownloadViaRipYoutubeInput) {
  await ensureFactoryDirs();

  const ripUrl = buildRipYoutubeUrl(input.sourceUrl);
  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);

  await input.onProgress?.(2, "Открываю RIP-страницу");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: {
        width: 1365,
        height: 900,
      },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      locale: "en-US",
    });

    const page = await context.newPage();

    page.on("popup", async (popup) => {
      await popup.close().catch(() => {});
    });

    await page.goto(ripUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await page.waitForTimeout(4000);
    await input.onProgress?.(7, "RIP-страница загружена");

    for (let step = 1; step <= 6; step += 1) {
      await assertNotCanceled(input.isCanceled);

      const link = await getBestDownloadLink(page);

      if (link) {
        await input.onProgress?.(
          10 + step * 3,
          `Нашел ссылку скачивания, пробую скачать MP4`,
        );

        await downloadHrefToFile({
          href: link.href,
          outputPath,
          isCanceled: input.isCanceled,
        });

        await input.onProgress?.(30, "MP4 скачан через RIP-сервис");

        return outputPath;
      }

      await input.onProgress?.(
        10 + step * 3,
        `RIP: шаг ${step}/6 — нажимаю кнопку скачивания`,
      );

      const downloadPromise = page
        .waitForEvent("download", {
          timeout: 20000,
        })
        .catch(() => null);

      const clicked = await clickBestButton(page);

      if (!clicked) {
        throw new Error("RIP-сервис не дал кнопку скачивания");
      }

      const download = await downloadPromise;

      if (download) {
        await download.saveAs(outputPath);
        await input.onProgress?.(30, "MP4 скачан через RIP-сервис");

        return outputPath;
      }

      await page.waitForLoadState("domcontentloaded", {
        timeout: 20000,
      }).catch(() => {});

      await page.waitForTimeout(4000);
    }

    const finalLink = await getBestDownloadLink(page);

    if (finalLink) {
      await downloadHrefToFile({
        href: finalLink.href,
        outputPath,
        isCanceled: input.isCanceled,
      });

      await input.onProgress?.(30, "MP4 скачан через RIP-сервис");

      return outputPath;
    }

    throw new Error("RIP-сервис не вернул MP4-ссылку");
  } finally {
    await browser.close().catch(() => {});
  }
}
