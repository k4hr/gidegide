import path from "node:path";
import { rm } from "node:fs/promises";
import { chromium, type Page } from "playwright";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { hasAudioStream, runCommand } from "@/lib/factory/video";

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
  if (value.includes("скачать")) score += 40;
  if (value.includes("mp4")) score += 40;
  if (value.includes("avc1")) score += 10;
  if (value.includes("video")) score += 8;
  if (value.includes("genyoutube")) score += 8;
  if (value.includes("/mates/")) score += 8;
  if (value.includes("quality")) score += 6;

  if (value.includes("720p60")) score += 120;
  else if (value.includes("720p")) score += 115;
  else if (value.includes("720")) score += 110;

  if (value.includes("1080p60")) score += 20;
  else if (value.includes("1080p")) score += 15;
  else if (value.includes("1080")) score += 10;

  if (value.includes("480p")) score -= 10;
  if (value.includes("360p")) score -= 25;
  if (value.includes("240p")) score -= 50;
  if (value.includes("144p")) score -= 60;

  if (value.includes("mp3")) score -= 120;
  if (value.includes("audio only")) score -= 120;
  if (value.includes("audio-only")) score -= 120;
  if (value.includes("advert")) score -= 80;
  if (value.includes("adclick")) score -= 80;

  if (value.includes("🔇")) score -= 250;
  if (value.includes("muted")) score -= 250;
  if (value.includes("no audio")) score -= 250;
  if (value.includes("without audio")) score -= 250;
  if (value.includes("без звука")) score -= 250;

  if (value.includes("🔊")) score += 80;
  if (value.includes("sound")) score += 35;
  if (value.includes("audio")) score += 20;
  if (value.includes("with audio")) score += 80;
  if (value.includes("со звуком")) score += 80;

  return score;
}

async function getDownloadLinks(page: Page) {
  const candidates = await page.evaluate(() => {
    function getRowText(element: Element) {
      const row =
        element.closest("tr") ||
        element.closest("li") ||
        element.closest(".row") ||
        element.closest(".download") ||
        element.closest(".format");

      return row?.textContent || "";
    }

    return Array.from(document.querySelectorAll("a"))
      .map((link) => {
        const anchor = link as HTMLAnchorElement;
        const rowText = getRowText(anchor);

        return {
          href: anchor.href,
          text: [
            anchor.innerText || anchor.textContent || "",
            anchor.getAttribute("title") || "",
            anchor.getAttribute("aria-label") || "",
            rowText,
          ]
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        };
      })
      .filter((item) => item.href);
  });

  const unique = new Map<string, LinkCandidate>();

  for (const item of candidates) {
    if (isBadHref(item.href)) continue;

    const score = scoreDownloadLink(item.text, item.href);

    if (score <= 25) continue;

    const current = unique.get(item.href);

    if (!current || score > current.score) {
      unique.set(item.href, {
        ...item,
        score,
      });
    }
  }

  return Array.from(unique.values()).sort((a, b) => b.score - a.score);
}

async function getBestDownloadLink(page: Page) {
  const links = await getDownloadLinks(page);

  return links[0] ?? null;
}

async function clickBestButton(page: Page) {
  const clickable = page.locator("a, button, input[type='button'], input[type='submit']");
  const count = await clickable.count();

  const candidates: Array<{
    index: number;
    text: string;
    score: number;
  }> = [];

  for (let index = 0; index < Math.min(count, 140); index += 1) {
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

async function downloadAndValidateAudio(input: {
  href: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
  label: string;
}) {
  await rm(input.outputPath, {
    force: true,
  });

  await input.onProgress?.(22, input.label);

  await downloadHrefToFile({
    href: input.href,
    outputPath: input.outputPath,
    isCanceled: input.isCanceled,
  });

  const hasAudio = await hasAudioStream(input.outputPath);

  if (!hasAudio) {
    await rm(input.outputPath, {
      force: true,
    });

    throw new Error("RIP-ссылка скачалась без звука");
  }

  return input.outputPath;
}

async function tryDownloadLinksWithAudio(input: {
  links: LinkCandidate[];
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const preferredLinks = input.links
    .filter((link) => {
      const value = `${link.text} ${link.href}`.toLowerCase();

      return value.includes("720");
    })
    .concat(
      input.links.filter((link) => {
        const value = `${link.text} ${link.href}`.toLowerCase();

        return !value.includes("720");
      }),
    );

  const attempts = preferredLinks.slice(0, 8);
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const link = attempts[index];

    await assertNotCanceled(input.isCanceled);

    try {
      await input.onProgress?.(
        18 + Math.min(index, 4),
        `Пробую RIP MP4 со звуком: ${link.text.slice(0, 90) || "download link"}`,
      );

      return await downloadAndValidateAudio({
        href: link.href,
        outputPath: input.outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
        label: "Скачиваю RIP MP4 и проверяю звук",
      });
    } catch (error) {
      lastError = error;

      console.error(
        `RIP candidate failed or has no audio: ${link.text} ${link.href}`,
        error,
      );

      await input.onProgress?.(
        18 + Math.min(index, 4),
        "RIP-ссылка без звука, пробую следующую",
      );
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `RIP не дал MP4 со звуком: ${lastError.message}`
      : "RIP не дал MP4 со звуком",
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

      const links = await getDownloadLinks(page);

      if (links.length > 0) {
        const filePath = await tryDownloadLinksWithAudio({
          links,
          outputPath,
          isCanceled: input.isCanceled,
          onProgress: input.onProgress,
        });

        await input.onProgress?.(30, "MP4 720p со звуком скачан через RIP");

        return filePath;
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
        await rm(outputPath, {
          force: true,
        });

        await download.saveAs(outputPath);

        const hasAudio = await hasAudioStream(outputPath);

        if (hasAudio) {
          await input.onProgress?.(30, "MP4 со звуком скачан через RIP");
          return outputPath;
        }

        await rm(outputPath, {
          force: true,
        });

        await input.onProgress?.(
          18 + step,
          "RIP download был без звука, пробую другой вариант",
        );
      }

      await page.waitForLoadState("domcontentloaded", {
        timeout: 20000,
      }).catch(() => {});

      await page.waitForTimeout(4000);
    }

    const finalLinks = await getDownloadLinks(page);

    if (finalLinks.length > 0) {
      const filePath = await tryDownloadLinksWithAudio({
        links: finalLinks,
        outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      await input.onProgress?.(30, "MP4 720p со звуком скачан через RIP");

      return filePath;
    }

    const finalLink = await getBestDownloadLink(page);

    if (finalLink) {
      const filePath = await tryDownloadLinksWithAudio({
        links: [finalLink],
        outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      await input.onProgress?.(30, "MP4 со звуком скачан через RIP");

      return filePath;
    }

    throw new Error("RIP-сервис не вернул MP4-ссылку со звуком");
  } finally {
    await browser.close().catch(() => {});
  }
}
