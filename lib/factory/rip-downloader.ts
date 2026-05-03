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
  qualityRank: number;
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

function getUrlParam(value: string, key: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get(key);
  } catch {
    return null;
  }
}

function getYoutubeItag(href: string) {
  return getUrlParam(href, "itag");
}

function isGoogleVideoUrl(href: string) {
  try {
    const url = new URL(href);
    return url.hostname.includes("googlevideo.com");
  } catch {
    return false;
  }
}

function isKnownYoutubeVideoOnlyItag(itag: string | null) {
  if (!itag) return false;

  const videoOnlyItags = new Set([
    "133",
    "134",
    "135",
    "136",
    "137",
    "138",
    "160",
    "167",
    "168",
    "169",
    "170",
    "218",
    "219",
    "242",
    "243",
    "244",
    "245",
    "246",
    "247",
    "248",
    "264",
    "266",
    "271",
    "272",
    "278",
    "298",
    "299",
    "302",
    "303",
    "308",
    "313",
    "315",
    "330",
    "331",
    "332",
    "333",
    "334",
    "335",
    "336",
    "337",
    "394",
    "395",
    "396",
    "397",
    "398",
    "399",
    "400",
    "401",
    "571",
    "694",
    "695",
    "696",
    "697",
    "698",
    "699",
    "700",
    "701",
    "702",
  ]);

  return videoOnlyItags.has(itag);
}

function isKnownYoutubeAudioOnlyItag(itag: string | null) {
  if (!itag) return false;

  const audioOnlyItags = new Set([
    "139",
    "140",
    "141",
    "171",
    "172",
    "249",
    "250",
    "251",
    "599",
    "600",
  ]);

  return audioOnlyItags.has(itag);
}

function isKnownYoutubeProgressiveWithAudioItag(itag: string | null) {
  if (!itag) return false;

  const progressiveItags = new Set([
    "17",
    "18",
    "22",
    "36",
    "37",
    "38",
    "43",
    "44",
    "45",
    "46",
    "59",
    "78",
    "82",
    "83",
    "84",
    "85",
    "91",
    "92",
    "93",
    "94",
    "95",
    "96",
    "100",
    "101",
    "102",
  ]);

  return progressiveItags.has(itag);
}

function getQualityRank(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();
  const itag = getYoutubeItag(href);

  if (itag === "22") return 1000;
  if (value.includes("720p") && !value.includes("60")) return 950;
  if (value.includes("720")) return 900;
  if (value.includes("480p")) return 700;
  if (value.includes("480")) return 680;
  if (itag === "18") return 600;
  if (value.includes("360p")) return 500;
  if (value.includes("360")) return 480;
  if (value.includes("240p")) return 250;
  if (value.includes("144p")) return 100;

  return 0;
}

function isMarkedWithoutAudio(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();

  return (
    value.includes("🔇") ||
    value.includes("muted") ||
    value.includes("no audio") ||
    value.includes("without audio") ||
    value.includes("video only") ||
    value.includes("video-only") ||
    value.includes("без звука")
  );
}

function isMarkedWithAudio(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();

  return (
    value.includes("🔊") ||
    value.includes("sound") ||
    value.includes("with audio") ||
    value.includes("audio") ||
    value.includes("со звуком")
  );
}

function isDefinitelyVideoWithoutAudio(href: string, text: string) {
  const itag = getYoutubeItag(href);

  if (isKnownYoutubeVideoOnlyItag(itag)) {
    return true;
  }

  if (isKnownYoutubeAudioOnlyItag(itag)) {
    return true;
  }

  if (isMarkedWithoutAudio(text, href)) {
    return true;
  }

  return false;
}

function isProbablyDownloadLink(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();

  return (
    value.includes("download") ||
    value.includes("скачать") ||
    value.includes("mp4") ||
    value.includes("googlevideo.com") ||
    value.includes("videoplayback") ||
    value.includes("genyoutube") ||
    value.includes("/mates/")
  );
}

function scoreDownloadLink(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();
  const itag = getYoutubeItag(href);

  if (isBadHref(href)) {
    return -10000;
  }

  if (!isProbablyDownloadLink(text, href)) {
    return -10000;
  }

  if (isDefinitelyVideoWithoutAudio(href, text)) {
    return -10000;
  }

  let score = 0;

  if (isKnownYoutubeProgressiveWithAudioItag(itag)) score += 500;
  if (isMarkedWithAudio(text, href)) score += 300;

  if (value.includes("download")) score += 60;
  if (value.includes("скачать")) score += 60;
  if (value.includes("mp4")) score += 80;
  if (value.includes("avc1")) score += 20;
  if (value.includes("video")) score += 8;
  if (value.includes("googlevideo.com")) score += 35;
  if (value.includes("videoplayback")) score += 35;
  if (value.includes("genyoutube")) score += 15;
  if (value.includes("/mates/")) score += 15;
  if (value.includes("quality")) score += 6;

  if (itag === "22") score += 900;

  if (value.includes("720p60")) score -= 300;
  else if (value.includes("720p")) score += 450;
  else if (value.includes("720")) score += 400;

  if (value.includes("1080p60")) score -= 80;
  else if (value.includes("1080p")) score += 50;
  else if (value.includes("1080")) score += 30;

  if (value.includes("480p")) score += 120;
  if (value.includes("360p")) score += 40;
  if (value.includes("240p")) score -= 80;
  if (value.includes("144p")) score -= 100;

  if (value.includes("mp3")) score -= 500;
  if (value.includes("audio only")) score -= 500;
  if (value.includes("audio-only")) score -= 500;
  if (value.includes("advert")) score -= 400;
  if (value.includes("adclick")) score -= 400;

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
          element.closest(".col") ||
          element.parentElement;

        return row && row.textContent ? row.textContent : "";
      };

      return Array.from(document.querySelectorAll("a"))
        .map((link) => {
          const rowText = getRowText(link);

          return {
            href: link.href || "",
            text: [
              link.innerText || link.textContent || "",
              link.getAttribute("title") || "",
              link.getAttribute("aria-label") || "",
              link.getAttribute("download") || "",
              rowText
            ]
              .join(" ")
              .replace(/\\s+/g, " ")
              .trim()
          };
        })
        .filter((item) => item.href);
    })()
  `)) as Array<{
    href: string;
    text: string;
  }>;

  const unique = new Map<string, LinkCandidate>();

  for (const item of candidates) {
    if (isBadHref(item.href)) continue;
    if (isDefinitelyVideoWithoutAudio(item.href, item.text)) continue;

    const score = scoreDownloadLink(item.text, item.href);

    if (score <= 25) continue;

    const qualityRank = getQualityRank(item.text, item.href);
    const current = unique.get(item.href);

    if (!current || score > current.score) {
      unique.set(item.href, {
        ...item,
        score,
        qualityRank,
      });
    }
  }

  return Array.from(unique.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.qualityRank - a.qualityRank;
  });
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
    href: string;
    score: number;
  }> = [];

  for (let index = 0; index < Math.min(count, 160); index += 1) {
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

      if (isDefinitelyVideoWithoutAudio(href, text)) continue;

      const score = scoreDownloadLink(text, href);

      if (score <= 0) continue;

      candidates.push({
        index,
        text,
        href,
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
  text: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
  label: string;
}) {
  if (isDefinitelyVideoWithoutAudio(input.href, input.text)) {
    throw new Error("RIP-ссылка является video-only/audio-only и пропущена");
  }

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

function dedupeLinks(links: LinkCandidate[]) {
  const unique = new Map<string, LinkCandidate>();

  for (const link of links) {
    const current = unique.get(link.href);

    if (!current || link.score > current.score) {
      unique.set(link.href, link);
    }
  }

  return Array.from(unique.values());
}

function buildAttemptList(links: LinkCandidate[]) {
  const cleanLinks = dedupeLinks(
    links.filter((link) => !isDefinitelyVideoWithoutAudio(link.href, link.text)),
  );

  const progressive720 = cleanLinks.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();
    const itag = getYoutubeItag(link.href);

    return (
      (value.includes("720") || itag === "22") &&
      isKnownYoutubeProgressiveWithAudioItag(itag)
    );
  });

  const marked720WithAudio = cleanLinks.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();

    return value.includes("720") && isMarkedWithAudio(link.text, link.href);
  });

  const any720 = cleanLinks.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();

    return value.includes("720") && !value.includes("60");
  });

  const progressiveOther = cleanLinks.filter((link) => {
    const itag = getYoutubeItag(link.href);
    return isKnownYoutubeProgressiveWithAudioItag(itag);
  });

  const otherWithAudio = cleanLinks.filter((link) => {
    return isMarkedWithAudio(link.text, link.href);
  });

  const fallbackMp4 = cleanLinks.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();

    return (
      value.includes("mp4") &&
      !value.includes("mp3") &&
      !value.includes("audio only") &&
      !value.includes("audio-only")
    );
  });

  return dedupeLinks([
    ...progressive720,
    ...marked720WithAudio,
    ...any720,
    ...progressiveOther,
    ...otherWithAudio,
    ...fallbackMp4,
    ...cleanLinks,
  ]).slice(0, 12);
}

async function tryDownloadLinksWithAudio(input: {
  links: LinkCandidate[];
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const attempts = buildAttemptList(input.links);

  if (attempts.length === 0) {
    throw new Error(
      "RIP нашёл только video-only/audio-only ссылки. Нет MP4 720p со звуком.",
    );
  }

  let lastError: unknown = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const link = attempts[index];

    await assertNotCanceled(input.isCanceled);

    try {
      const itag = getYoutubeItag(link.href);
      const labelParts = [
        link.text.slice(0, 90) || "download link",
        itag ? `itag=${itag}` : "",
      ].filter(Boolean);

      await input.onProgress?.(
        18 + Math.min(index, 4),
        `Пробую RIP MP4 со звуком: ${labelParts.join(" · ")}`,
      );

      return await downloadAndValidateAudio({
        href: link.href,
        text: link.text,
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
        "RIP-ссылка без звука или недоступна, пробую следующую",
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

      await page
        .waitForLoadState("domcontentloaded", {
          timeout: 20000,
        })
        .catch(() => {});

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

    throw new Error(
      "RIP-сервис не вернул MP4-ссылку со звуком. Дай другое видео.",
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
