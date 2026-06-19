import path from "node:path";
import { rm } from "node:fs/promises";
import { chromium, type Page } from "playwright";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { assertVideoHasAudio, hasAudioStream, runCommand } from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

type DownloadVkVideoInput = {
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

const VK_DOWNLOAD_PAGE = "https://vkvideodownload.com/";

export function isVkVideoUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const full = `${host}${url.pathname}${url.search}`.toLowerCase();

    return (
      host === "vk.com" ||
      host === "m.vk.com" ||
      host === "vkvideo.ru" ||
      host.endsWith(".vk.com") ||
      full.includes("video") ||
      full.includes("clip")
    );
  } catch {
    return false;
  }
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
    lower.includes("chrome-extension") ||
    lower.includes("/privacy") ||
    lower.includes("/terms")
  );
}

function scoreDownloadLink(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();
  let score = 0;

  if (value.includes("download")) score += 40;
  if (value.includes("скачать")) score += 40;
  if (value.includes("mp4")) score += 55;
  if (value.includes("video")) score += 8;
  if (value.includes("vk")) score += 5;
  if (value.includes("quality")) score += 6;

  if (value.includes("1080")) score += 105;
  if (value.includes("720")) score += 100;
  if (value.includes("480")) score += 40;
  if (value.includes("360")) score += 20;

  if (value.includes("240")) score -= 30;
  if (value.includes("144")) score -= 50;
  if (value.includes("mp3")) score -= 120;
  if (value.includes("audio only")) score -= 120;
  if (value.includes("audio-only")) score -= 120;
  if (value.includes("advert")) score -= 80;
  if (value.includes("adclick")) score -= 80;

  if (value.includes("🔇")) score -= 500;
  if (value.includes("muted")) score -= 500;
  if (value.includes("no audio")) score -= 500;
  if (value.includes("without audio")) score -= 500;
  if (value.includes("без звука")) score -= 500;

  if (value.includes("🔊")) score += 120;
  if (value.includes("sound")) score += 70;
  if (value.includes("with audio")) score += 120;
  if (value.includes("со звуком")) score += 120;

  return score;
}

async function getDownloadLinks(page: Page) {
  const candidates = (await page.evaluate(`
    (() => {
      const getRowText = (element) => {
        const row =
          element.closest("tr") ||
          element.closest("li") ||
          element.closest(".row") ||
          element.closest(".download") ||
          element.closest(".format") ||
          element.closest(".quality") ||
          element.parentElement;

        return row && row.textContent ? row.textContent : "";
      };

      const anchors = Array.from(document.querySelectorAll("a"))
        .map((link) => {
          const rowText = getRowText(link);

          return {
            href: link.href || "",
            text: [
              link.innerText || link.textContent || "",
              link.getAttribute("title") || "",
              link.getAttribute("aria-label") || "",
              rowText
            ].join(" ").replace(/\\s+/g, " ").trim()
          };
        })
        .filter((item) => item.href);

      const sources = Array.from(document.querySelectorAll("video source, video"))
        .map((item) => ({
          href: item.getAttribute("src") || "",
          text: "video source mp4"
        }))
        .filter((item) => item.href);

      return [...anchors, ...sources];
    })()
  `)) as Array<{ href: string; text: string }>;

  const unique = new Map<string, LinkCandidate>();

  for (const item of candidates) {
    if (isBadHref(item.href)) continue;

    const score = scoreDownloadLink(item.text, item.href);

    if (score <= 25) continue;

    const current = unique.get(item.href);

    if (!current || score > current.score) {
      unique.set(item.href, { ...item, score });
    }
  }

  return Array.from(unique.values()).sort((a, b) => b.score - a.score);
}

async function fillVkUrl(page: Page, sourceUrl: string) {
  const inputs = page.locator("input[type='url'], input[type='text'], textarea, input:not([type])");
  const count = await inputs.count();

  for (let index = 0; index < Math.min(count, 12); index += 1) {
    const input = inputs.nth(index);

    try {
      if (!(await input.isVisible())) continue;
      await input.fill(sourceUrl, { timeout: 10000 });
      return true;
    } catch {
      // ignore broken input
    }
  }

  return false;
}

async function clickDownloadButton(page: Page) {
  const clickable = page.locator("button, input[type='button'], input[type='submit'], a");
  const count = await clickable.count();
  const candidates: Array<{ index: number; score: number; text: string }> = [];

  for (let index = 0; index < Math.min(count, 100); index += 1) {
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
      candidates.push({ index, score, text });
    } catch {
      // ignore broken nodes
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best) return false;

  await clickable.nth(best.index).click({ timeout: 15000, force: true });
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
      "-H",
      "Referer: https://vk.com/",
      "-o",
      input.outputPath,
      input.href,
    ],
    {
      logPrefix: "vk-curl",
      isCanceled: input.isCanceled,
    },
  );
}

async function downloadAndValidate(input: {
  href: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
  label: string;
}) {
  await rm(input.outputPath, { force: true });
  await input.onProgress?.(22, input.label);

  await downloadHrefToFile({
    href: input.href,
    outputPath: input.outputPath,
    isCanceled: input.isCanceled,
  });

  const hasAudio = await hasAudioStream(input.outputPath);

  if (!hasAudio) {
    await rm(input.outputPath, { force: true });
    throw new Error("VK-ссылка скачалась без звука");
  }

  await assertVideoHasAudio(input.outputPath);
  return input.outputPath;
}

async function tryDownloadLinksWithAudio(input: {
  links: LinkCandidate[];
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const highQuality = input.links.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();
    return (value.includes("1080") || value.includes("720")) && !value.includes("🔇");
  });
  const other = input.links.filter((link) => !highQuality.includes(link));
  const attempts = [...highQuality, ...other].slice(0, 10);
  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const link = attempts[index];

    await assertNotCanceled(input.isCanceled);

    try {
      await input.onProgress?.(
        18 + Math.min(index, 4),
        `Пробую VK MP4 со звуком: ${link.text.slice(0, 90) || "download link"}`,
      );

      return await downloadAndValidate({
        href: link.href,
        outputPath: input.outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
        label: "Скачиваю VK MP4 и проверяю звук",
      });
    } catch (error) {
      lastError = error;
      console.error(`VK candidate failed or has no audio: ${link.text} ${link.href}`, error);
      await input.onProgress?.(18 + Math.min(index, 4), "VK-ссылка без звука, пробую следующую");
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `VK downloader не дал MP4 со звуком: ${lastError.message}`
      : "VK downloader не дал MP4 со звуком",
  );
}

export async function downloadViaVkVideo(input: DownloadVkVideoInput) {
  await ensureFactoryDirs();

  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);

  await input.onProgress?.(2, "Открываю VK downloader");

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
      viewport: { width: 1365, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      locale: "ru-RU",
    });

    const page = await context.newPage();

    page.on("popup", async (popup) => {
      await popup.close().catch(() => {});
    });

    await page.goto(VK_DOWNLOAD_PAGE, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });

    await page.waitForTimeout(2500);
    await input.onProgress?.(7, "VK downloader загружен");

    const filled = await fillVkUrl(page, input.sourceUrl);

    if (!filled) {
      throw new Error("VK downloader не дал поле для ссылки");
    }

    for (let step = 1; step <= 6; step += 1) {
      await assertNotCanceled(input.isCanceled);

      await input.onProgress?.(8 + step * 2, `VK downloader: шаг ${step}/6`);

      const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
      const clicked = await clickDownloadButton(page);

      if (!clicked && step === 1) {
        throw new Error("VK downloader не дал кнопку скачивания");
      }

      const download = await downloadPromise;

      if (download) {
        await rm(outputPath, { force: true });
        await download.saveAs(outputPath);

        if (await hasAudioStream(outputPath)) {
          await input.onProgress?.(30, "VK MP4 со звуком скачан");
          return outputPath;
        }

        await rm(outputPath, { force: true });
        await input.onProgress?.(18 + step, "VK download был без звука, пробую ссылки на странице");
      }

      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const links = await getDownloadLinks(page);

      if (links.length > 0) {
        const filePath = await tryDownloadLinksWithAudio({
          links,
          outputPath,
          isCanceled: input.isCanceled,
          onProgress: input.onProgress,
        });

        await input.onProgress?.(30, "VK MP4 со звуком скачан");
        return filePath;
      }
    }

    throw new Error("VK downloader не вернул MP4-ссылку со звуком");
  } finally {
    await browser.close().catch(() => {});
  }
}
