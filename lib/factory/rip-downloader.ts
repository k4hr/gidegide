import path from "node:path";
import { readFile, rm, stat } from "node:fs/promises";
import { chromium, type Locator, type Page } from "playwright";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "./paths";
import { hasAudioStream, hasVideoStream, runCommand } from "./video";

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
  source: "link" | "row";
};

type ClickCandidate = {
  index: number;
  text: string;
  href: string;
  score: number;
  qualityRank: number;
};

const MIN_VIDEO_FILE_BYTES = 1024 * 1024;

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

function safeUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getUrlParam(value: string, key: string) {
  return safeUrl(value)?.searchParams.get(key) ?? null;
}

function getYoutubeItag(href: string) {
  return getUrlParam(href, "itag");
}

function isGoogleVideoUrl(href: string) {
  return safeUrl(href)?.hostname.includes("googlevideo.com") ?? false;
}

function isBadHref(href: string) {
  const lower = href.toLowerCase().trim();

  return (
    !lower ||
    lower.startsWith("javascript:") ||
    lower.startsWith("#") ||
    lower.includes("facebook.com") ||
    lower.includes("twitter.com") ||
    lower.includes("telegram") ||
    lower.includes("whatsapp") ||
    lower.includes("mailto:") ||
    lower.includes("chrome-extension")
  );
}

function isRipyoutubeNavigationHref(href: string, text = "") {
  const url = safeUrl(href);
  const value = `${href} ${text}`.toLowerCase();

  if (!url) return false;

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase().replace(/\/+$/, "");

  if (!host.includes("ripyoutube.com")) {
    return false;
  }

  const navPaths = new Set([
    "",
    "/",
    "/en",
    "/en/youtube-to-mp3-converter",
    "/en/youtube-to-mp4-converter",
    "/en/youtube-video-downloader",
    "/en/youtube-shorts-downloader",
    "/en/facebook-video-downloader",
    "/en/instagram-video-downloader",
    "/en/tiktok-video-downloader",
    "/privacy",
    "/terms",
    "/contact",
  ]);

  if (navPaths.has(pathname)) {
    return true;
  }

  return (
    value.includes("youtube to mp4 converter") ||
    value.includes("youtube video downloader") ||
    value.includes("youtube to mp3") ||
    value.includes("converter") ||
    value.includes("downloader") && !looksLikeMediaRow(text, href)
  );
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

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
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
    value.includes("audio only") ||
    value.includes("audio-only") ||
    value.includes("без звука")
  );
}

function isMarkedWithAudio(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();

  return (
    value.includes("🔊") ||
    value.includes("speaker") ||
    value.includes("with audio") ||
    value.includes("audio") ||
    value.includes("со звуком") ||
    value.includes("mp4 avc1")
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

function looksLikeMediaRow(text: string, href = "") {
  const value = `${text} ${href}`.toLowerCase();

  return (
    (value.includes("mp4") || value.includes("avc1") || value.includes("video/mp4")) &&
    /(720p60|720p|480p|360p|1080p60|1080p|\b720\b|\b480\b|\b360\b)/.test(value)
  );
}

function isLikelyDirectMediaHref(href: string) {
  const url = safeUrl(href);

  if (!url) return false;

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();
  const value = href.toLowerCase();

  return (
    host.includes("googlevideo.com") ||
    value.includes("videoplayback") ||
    value.includes("download") ||
    value.includes("/download") ||
    value.includes("/dl") ||
    value.includes("/mates/") ||
    value.includes("genyoutube") ||
    pathname.endsWith(".mp4")
  );
}

function isProbablyDownloadLink(text: string, href: string) {
  if (isRipyoutubeNavigationHref(href, text)) return false;

  const value = `${text} ${href}`.toLowerCase();

  return (
    looksLikeMediaRow(text, href) ||
    value.includes("download") ||
    value.includes("скачать") ||
    value.includes("googlevideo.com") ||
    value.includes("videoplayback") ||
    value.includes("genyoutube") ||
    value.includes("/mates/") ||
    value.includes(".mp4")
  );
}

function getQualityRank(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();
  const itag = getYoutubeItag(href);

  if (itag === "22") return 1000;
  if (value.includes("720p60")) return 980;
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

function scoreDownloadLink(text: string, href: string) {
  const value = `${text} ${href}`.toLowerCase();
  const itag = getYoutubeItag(href);

  if (isBadHref(href)) return -10000;
  if (isRipyoutubeNavigationHref(href, text)) return -10000;
  if (!isProbablyDownloadLink(text, href)) return -10000;
  if (isDefinitelyVideoWithoutAudio(href, text)) return -10000;

  let score = 0;

  if (isKnownYoutubeProgressiveWithAudioItag(itag)) score += 700;
  if (isMarkedWithAudio(text, href)) score += 350;
  if (looksLikeMediaRow(text, href)) score += 300;
  if (isLikelyDirectMediaHref(href)) score += 250;

  if (value.includes("download")) score += 80;
  if (value.includes("скачать")) score += 80;
  if (value.includes("mp4")) score += 120;
  if (value.includes("avc1")) score += 50;
  if (value.includes("googlevideo.com")) score += 120;
  if (value.includes("videoplayback")) score += 120;
  if (value.includes("quality")) score += 10;

  if (itag === "22") score += 1000;

  if (value.includes("720p60")) score += 620;
  else if (value.includes("720p")) score += 580;
  else if (value.includes("720")) score += 520;

  if (value.includes("1080p60")) score += 80;
  else if (value.includes("1080p")) score += 60;
  else if (value.includes("1080")) score += 40;

  if (value.includes("480p")) score += 180;
  if (value.includes("360p")) score += 90;
  if (value.includes("240p")) score -= 120;
  if (value.includes("144p")) score -= 180;
  if (value.includes("mp3")) score -= 1000;
  if (value.includes("advert") || value.includes("adclick")) score -= 1000;

  return score;
}

function toCandidate(item: { href: string; text: string; source: "link" | "row" }) {
  const text = normalizeText(item.text);
  const href = item.href.trim();
  const score = scoreDownloadLink(text, href);

  if (score <= 50) return null;

  return {
    href,
    text,
    score,
    qualityRank: getQualityRank(text, href),
    source: item.source,
  } satisfies LinkCandidate;
}

async function getDownloadLinks(page: Page) {
  const candidates = (await page.evaluate(`
    (() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const getRow = (element) =>
        element.closest('tr') ||
        element.closest('li') ||
        element.closest('.row') ||
        element.closest('.download') ||
        element.closest('.format') ||
        element.closest('.col') ||
        element.closest('[class*=quality]') ||
        element.closest('[class*=format]') ||
        element.closest('[class*=download]') ||
        element.parentElement;

      const items = [];

      for (const link of Array.from(document.querySelectorAll('a[href]'))) {
        const row = getRow(link);
        const rowText = row ? normalize(row.textContent) : '';
        items.push({
          source: 'link',
          href: link.href || '',
          text: normalize([
            link.innerText || link.textContent || '',
            link.getAttribute('title') || '',
            link.getAttribute('aria-label') || '',
            link.getAttribute('download') || '',
            rowText,
          ].join(' ')),
        });
      }

      for (const row of Array.from(document.querySelectorAll('tr, li, .row, .download, .format, [class*=quality], [class*=format]'))) {
        const rowText = normalize(row.textContent || '');
        const link = row.querySelector('a[href]');
        if (link && rowText) {
          items.push({
            source: 'row',
            href: link.href || '',
            text: rowText,
          });
        }
      }

      return items.filter((item) => item.href && item.text);
    })()
  `)) as Array<{
    href: string;
    text: string;
    source: "link" | "row";
  }>;

  const unique = new Map<string, LinkCandidate>();

  for (const item of candidates) {
    if (isBadHref(item.href)) continue;
    if (isRipyoutubeNavigationHref(item.href, item.text)) continue;
    if (isDefinitelyVideoWithoutAudio(item.href, item.text)) continue;

    const candidate = toCandidate(item);
    if (!candidate) continue;

    const current = unique.get(candidate.href);
    if (!current || candidate.score > current.score) {
      unique.set(candidate.href, candidate);
    }
  }

  const result = Array.from(unique.values()).sort((a, b) => {
    if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
    return b.score - a.score;
  });

  if (result.length > 0) {
    console.log(
      "RIP media link candidates",
      result.slice(0, 6).map((item) => ({
        text: item.text.slice(0, 120),
        score: item.score,
        qualityRank: item.qualityRank,
        href: item.href.slice(0, 160),
      })),
    );
  }

  return result;
}

async function buildClickCandidates(page: Page) {
  const clickable = page.locator("a, button, input[type='button'], input[type='submit']");
  const count = await clickable.count();
  const candidates: ClickCandidate[] = [];

  for (let index = 0; index < Math.min(count, 220); index += 1) {
    const item = clickable.nth(index);

    try {
      if (!(await item.isVisible())) continue;

      const text = normalizeText(
        [
          await item.innerText().catch(() => ""),
          await item.getAttribute("value").catch(() => ""),
          await item.getAttribute("title").catch(() => ""),
          await item.getAttribute("aria-label").catch(() => ""),
          await item
            .locator("xpath=ancestor::tr[1] | xpath=ancestor::li[1]")
            .first()
            .innerText()
            .catch(() => ""),
          await item
            .locator("xpath=ancestor::*[contains(@class,'row') or contains(@class,'download') or contains(@class,'format')][1]")
            .first()
            .innerText()
            .catch(() => ""),
        ].join(" "),
      );
      const href = (await item.getAttribute("href").catch(() => "")) || "";

      if (isBadHref(href) && !text) continue;
      if (isRipyoutubeNavigationHref(href, text)) continue;
      if (isDefinitelyVideoWithoutAudio(href, text)) continue;
      if (!looksLikeMediaRow(text, href) && !isLikelyDirectMediaHref(href)) continue;

      const score = scoreDownloadLink(text, href || page.url());
      if (score <= 40) continue;

      candidates.push({
        index,
        text,
        href,
        score,
        qualityRank: getQualityRank(text, href),
      });
    } catch {
      // ignore broken nodes
    }
  }

  candidates.sort((a, b) => {
    if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
    return b.score - a.score;
  });

  if (candidates.length > 0) {
    console.log(
      "RIP click candidates",
      candidates.slice(0, 6).map((item) => ({
        text: item.text.slice(0, 120),
        score: item.score,
        qualityRank: item.qualityRank,
        href: item.href.slice(0, 160),
      })),
    );
  }

  return { clickable, candidates };
}

async function clickBestButton(page: Page) {
  const { clickable, candidates } = await buildClickCandidates(page);
  const best = candidates[0];

  if (!best) return false;

  await clickable.nth(best.index).click({
    timeout: 15000,
    force: true,
  });

  return true;
}

async function getFileSize(filePath: string) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function looksLikeHtmlFile(filePath: string) {
  try {
    const buffer = await readFile(filePath);
    const start = buffer.subarray(0, 4096).toString("utf8").toLowerCase();

    return (
      start.includes("<!doctype html") ||
      start.includes("<html") ||
      start.includes("<head") ||
      start.includes("<body") ||
      start.includes("youtube to mp4 converter") ||
      start.includes("youtube video downloader")
    );
  } catch {
    return false;
  }
}

async function validateDownloadedVideo(input: {
  filePath: string;
  text: string;
  href: string;
}) {
  const fileSize = await getFileSize(input.filePath);

  if (fileSize < MIN_VIDEO_FILE_BYTES) {
    await rm(input.filePath, { force: true });
    throw new Error(
      `RIP скачал не видео, а слишком маленький файл (${fileSize} bytes)`,
    );
  }

  if (await looksLikeHtmlFile(input.filePath)) {
    await rm(input.filePath, { force: true });
    throw new Error("RIP скачал HTML-страницу вместо MP4");
  }

  const hasVideo = await hasVideoStream(input.filePath);

  if (!hasVideo) {
    await rm(input.filePath, { force: true });
    throw new Error("RIP-ссылка скачалась без видеодорожки: это audio-only файл");
  }

  const hasAudio = await hasAudioStream(input.filePath);

  if (!hasAudio) {
    await rm(input.filePath, { force: true });
    throw new Error("RIP-ссылка скачалась без звука");
  }

  console.log("RIP selected candidate", {
    text: input.text.slice(0, 160),
    href: input.href.slice(0, 220),
    fileSize,
  });

  return input.filePath;
}

async function downloadHrefToFile(input: {
  href: string;
  outputPath: string;
  referer?: string;
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
      ...(input.referer ? ["-H", `Referer: ${input.referer}`] : []),
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
  referer?: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
  label: string;
}) {
  if (isRipyoutubeNavigationHref(input.href, input.text)) {
    throw new Error("RIP-ссылка является страницей навигации, не MP4");
  }

  if (isDefinitelyVideoWithoutAudio(input.href, input.text)) {
    throw new Error("RIP-ссылка является video-only/audio-only и пропущена");
  }

  await rm(input.outputPath, { force: true });
  await input.onProgress?.(22, input.label);

  await downloadHrefToFile({
    href: input.href,
    outputPath: input.outputPath,
    referer: input.referer,
    isCanceled: input.isCanceled,
  });

  return validateDownloadedVideo({
    filePath: input.outputPath,
    text: input.text,
    href: input.href,
  });
}

async function validatePlaywrightDownload(input: {
  filePath: string;
  candidateText: string;
  candidateHref: string;
}) {
  return validateDownloadedVideo({
    filePath: input.filePath,
    text: input.candidateText,
    href: input.candidateHref,
  });
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
    links.filter(
      (link) =>
        !isRipyoutubeNavigationHref(link.href, link.text) &&
        !isDefinitelyVideoWithoutAudio(link.href, link.text),
    ),
  );

  const with720 = cleanLinks.filter((link) => {
    const value = `${link.text} ${link.href}`.toLowerCase();
    const itag = getYoutubeItag(link.href);

    return value.includes("720") || itag === "22";
  });

  const progressive = cleanLinks.filter((link) =>
    isKnownYoutubeProgressiveWithAudioItag(getYoutubeItag(link.href)),
  );

  const withAudio = cleanLinks.filter((link) =>
    isMarkedWithAudio(link.text, link.href),
  );

  const directMedia = cleanLinks.filter((link) => isLikelyDirectMediaHref(link.href));

  const mp4Rows = cleanLinks.filter((link) => looksLikeMediaRow(link.text, link.href));

  return dedupeLinks([
    ...with720,
    ...progressive,
    ...withAudio,
    ...directMedia,
    ...mp4Rows,
    ...cleanLinks,
  ])
    .sort((a, b) => {
      if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
      return b.score - a.score;
    })
    .slice(0, 16);
}

async function tryDownloadLinksWithAudio(input: {
  links: LinkCandidate[];
  outputPath: string;
  referer?: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const attempts = buildAttemptList(input.links);

  if (attempts.length === 0) {
    throw new Error(
      "RIP не нашёл MP4-ссылку с видео и звуком. Есть только navigation/video-only/audio-only.",
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
        18 + Math.min(index, 6),
        `Пробую RIP MP4 с видео и звуком: ${labelParts.join(" · ")}`,
      );

      return await downloadAndValidateAudio({
        href: link.href,
        text: link.text,
        outputPath: input.outputPath,
        referer: input.referer,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
        label: "Скачиваю RIP MP4 и проверяю видео/звук",
      });
    } catch (error) {
      lastError = error;

      console.error(
        `RIP candidate failed or has no video/audio: ${link.text.slice(0, 180)} ${link.href.slice(0, 220)}`,
        error,
      );

      await input.onProgress?.(
        18 + Math.min(index, 6),
        "RIP-ссылка не подошла, пробую следующую",
      );
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `RIP не дал MP4 со звуком: ${lastError.message}`
      : "RIP не дал MP4 со звуком",
  );
}

async function tryClickDownloadCandidates(input: {
  page: Page;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const { clickable, candidates } = await buildClickCandidates(input.page);
  let lastError: unknown = null;

  for (let index = 0; index < Math.min(candidates.length, 12); index += 1) {
    const candidate = candidates[index];
    await assertNotCanceled(input.isCanceled);

    try {
      await input.onProgress?.(
        14 + Math.min(index, 6),
        `RIP: нажимаю MP4 со звуком ${candidate.text.slice(0, 60)}`,
      );

      const downloadPromise = input.page
        .waitForEvent("download", { timeout: 25000 })
        .catch(() => null);

      await clickable.nth(candidate.index).click({
        timeout: 15000,
        force: true,
      });

      const download = await downloadPromise;

      if (download) {
        await rm(input.outputPath, { force: true });
        await download.saveAs(input.outputPath);

        await validatePlaywrightDownload({
          filePath: input.outputPath,
          candidateText: candidate.text,
          candidateHref: candidate.href,
        });

        await input.onProgress?.(30, "MP4 со звуком скачан через RIP");
        return input.outputPath;
      }

      await input.page
        .waitForLoadState("domcontentloaded", { timeout: 15000 })
        .catch(() => {});
      await input.page.waitForTimeout(2500);

      const links = await getDownloadLinks(input.page);
      if (links.length > 0) {
        return await tryDownloadLinksWithAudio({
          links,
          outputPath: input.outputPath,
          referer: input.page.url(),
          isCanceled: input.isCanceled,
          onProgress: input.onProgress,
        });
      }
    } catch (error) {
      lastError = error;
      console.error(
        `RIP click candidate failed: ${candidate.text.slice(0, 180)} ${candidate.href.slice(0, 220)}`,
        error,
      );
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("RIP не дал кликабельную MP4-кнопку со звуком");
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
      viewport: { width: 1365, height: 900 },
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

    let lastError: unknown = null;

    for (let step = 1; step <= 8; step += 1) {
      await assertNotCanceled(input.isCanceled);

      const links = await getDownloadLinks(page);

      if (links.length > 0) {
        try {
          const filePath = await tryDownloadLinksWithAudio({
            links,
            outputPath,
            referer: page.url(),
            isCanceled: input.isCanceled,
            onProgress: input.onProgress,
          });

          await input.onProgress?.(30, "MP4 720p со звуком скачан через RIP");
          return filePath;
        } catch (error) {
          lastError = error;
          console.error("RIP direct links failed, trying buttons", error);
        }
      }

      try {
        const filePath = await tryClickDownloadCandidates({
          page,
          outputPath,
          isCanceled: input.isCanceled,
          onProgress: input.onProgress,
        });

        return filePath;
      } catch (error) {
        lastError = error;
        console.error("RIP button flow failed", error);
      }

      await input.onProgress?.(
        10 + step * 3,
        `RIP: шаг ${step}/8 — жду новые ссылки скачивания`,
      );

      await page
        .waitForLoadState("domcontentloaded", { timeout: 15000 })
        .catch(() => {});
      await page.waitForTimeout(3500);
    }

    throw new Error(
      lastError instanceof Error
        ? `RIP-сервис не вернул MP4 со звуком: ${lastError.message}`
        : "RIP-сервис не вернул MP4 со звуком. Дай другое видео или загрузи файл вручную.",
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
