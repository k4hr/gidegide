import path from "node:path";
import { copyFile, mkdir, open, rm, stat } from "node:fs/promises";
import { nanoid } from "nanoid";

import {
  FACTORY_OUTPUT_DIR,
  FACTORY_SOURCE_DIR,
  FACTORY_TEMP_DIR,
  ensureFactoryDirs,
} from "./paths";
import {
  downloadViaRipYoutube,
  isYoutubeUrl,
} from "./rip-downloader";
import { downloadViaVkVideo, isVkVideoUrl } from "./vk-downloader";
import { downloadInstagramPublicVideo } from "./providers/instagram-public-provider";
import { MOVIE_SMART_CONFIG } from "./movie-smart-config";
import {
  areMovieSubtitlesEnabled,
  burnMovieSubtitles,
} from "./movie-subtitles";
import { assertVideoHasVideo, getVideoDurationSeconds, runCommand } from "./video";
import {
  applyGlobalOverlayToVideo,
  isGlobalOverlayEnabled,
} from "./video-overlay";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

export function isInstagramPageUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^m\./, "www.");
    if (host !== "instagram.com" && host !== "www.instagram.com") return false;
    return /^\/(reel|p|tv)\/[^/]+\/?/i.test(url.pathname);
  } catch {
    return /instagram\.com\/(?:reel|p|tv)\//i.test(value);
  }
}

function printableSample(buffer: Buffer) {
  return buffer
    .toString("utf8")
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function readFileHead(filePath: string, bytes = 1024) {
  const handle = await open(filePath, "r").catch(() => null);
  if (!handle) return Buffer.alloc(0);

  try {
    const buffer = Buffer.alloc(bytes);
    const result = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function assertDownloadedVideoFile(filePath: string, sourceUrl: string) {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat || fileStat.size <= 0) {
    throw new Error("Скачивание вернуло пустой файл вместо видео");
  }

  try {
    await assertVideoHasVideo(filePath);
    await getVideoDurationSeconds(filePath);
  } catch (error) {
    const head = await readFileHead(filePath);
    const sample = printableSample(head);
    await rm(filePath, { force: true }).catch(() => undefined);

    const reason = error instanceof Error ? error.message : "unknown ffprobe error";
    const hint = sample
      ? ` Ответ сервера начинается так: ${sample}`
      : " Ответ сервера не похож на MP4.";

    throw new Error(
      `Прямая ссылка не вернула валидный MP4. Скачано ${fileStat.size} байт, ffprobe не смог открыть файл (${reason}).${hint} Source: ${sourceUrl}`,
    );
  }
}

async function downloadInstagramSource(input: {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
}) {
  await ensureFactoryDirs();
  await input.onProgress?.(2, "Скачиваю Instagram Reel через yt-dlp/cookies");

  const outputDir = path.join(FACTORY_SOURCE_DIR, "instagram-job", input.jobId);
  const downloaded = await downloadInstagramPublicVideo({
    sourceUrl: input.sourceUrl,
    outputDir,
  });

  await assertDownloadedVideoFile(downloaded.filePath, input.sourceUrl);
  await input.onProgress?.(30, "Instagram Reel скачан и проверен");

  return downloaded.filePath;
}


export function isInstagramRelatedUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      host === "instagram.com" ||
      host === "www.instagram.com" ||
      host === "m.instagram.com" ||
      host.endsWith(".instagram.com") ||
      host.includes("cdninstagram.com") ||
      host.includes("fbcdn.net") ||
      host.startsWith("scontent")
    );
  } catch {
    return /(instagram\.com|cdninstagram\.com|fbcdn\.net|scontent[^\s/]*\.)/i.test(value);
  }
}

export type FactoryRenderTemplate = {
  mirrorLana: boolean;
};

function buildCenteredMovieFilter() {
  const scale = MOVIE_SMART_CONFIG.movieMainScale;
  const blurFilter = MOVIE_SMART_CONFIG.movieBackgroundBlur
    ? "gblur=sigma=32,"
    : "";

  return [
    "[0:v]split=2[bgsrc][fgsrc]",
    `[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${blurFilter}eq=brightness=-0.07:saturation=0.85,setsar=1[bg]`,
    `[fgsrc]scale='trunc(min(1080/iw\\,1920/ih)*iw*${scale.toFixed(2)}/2)*2':'trunc(min(1080/iw\\,1920/ih)*ih*${scale.toFixed(2)}/2)*2',crop='trunc(min(iw\\,1080)/2)*2':'trunc(min(ih\\,1920)/2)*2',setsar=1[fg]`,
    "[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]",
  ].join(";");
}

function buildRenderFilter(template: FactoryRenderTemplate) {
  const personFilters = [
    "scale=1080:960:force_original_aspect_ratio=increase",
    "crop=1080:960",
    template.mirrorLana ? "hflip" : null,
    "setsar=1",
  ]
    .filter(Boolean)
    .join(",");

  return [
    "[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[game]",
    `[1:v]${personFilters}[person]`,
    "[game][person]vstack=inputs=2,format=yuv420p[v]",
  ].join(";");
}

export async function downloadDirectSource(input: {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
}) {
  await ensureFactoryDirs();

  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);

  await input.onProgress?.(2, "Начинаю скачивать прямую ссылку");

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
      outputPath,
      input.sourceUrl,
    ],
    {
      logPrefix: "direct-curl",
      isCanceled: input.isCanceled,
    },
  );

  await assertDownloadedVideoFile(outputPath, input.sourceUrl);

  await input.onProgress?.(30, "Исходный файл скачан и проверен");

  return outputPath;
}

export async function downloadYoutubeSourceWithYtDlp(input: {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
}) {
  await ensureFactoryDirs();

  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);

  await input.onProgress?.(2, "Пробую скачать через yt-dlp");

  await runCommand(
    "yt-dlp",
    [
      "--newline",
      "--no-playlist",
      "--socket-timeout",
      "30",
      "--retries",
      "3",
      "--fragment-retries",
      "3",
      "--js-runtimes",
      "node:/usr/local/bin/node",
      "-f",
      "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/best[height<=720]/best",
      "--merge-output-format",
      "mp4",
      "-o",
      outputPath,
      input.sourceUrl,
    ],
    {
      logPrefix: "yt-dlp",
      isCanceled: input.isCanceled,
      onOutput: async (text) => {
        const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);

        if (!match) return;

        const downloadPercent = Number(match[1]);

        if (!Number.isFinite(downloadPercent)) return;

        const totalProgress = Math.min(
          30,
          Math.max(2, Math.round(downloadPercent * 0.3)),
        );

        await input.onProgress?.(
          totalProgress,
          `Скачивание yt-dlp: ${downloadPercent.toFixed(1)}%`,
        );
      },
    },
  );

  await input.onProgress?.(30, "YouTube-исходник скачан");

  return outputPath;
}

export async function downloadSourceFromUrl(input: {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
}) {
  if (isVkVideoUrl(input.sourceUrl) && !isYoutubeUrl(input.sourceUrl)) {
    try {
      return await downloadViaVkVideo(input);
    } catch (error) {
      console.error("VK downloader failed", error);
      const reason =
        error instanceof Error ? error.message : "неизвестная ошибка";
      throw new Error(
        `Не получилось скачать это VK-видео со звуком: ${reason}`,
      );
    }
  }

  if (isInstagramPageUrl(input.sourceUrl)) {
    return downloadInstagramSource(input);
  }

  if (isInstagramRelatedUrl(input.sourceUrl)) {
    throw new Error(
      "Instagram вернул временную CDN/media ссылку вместо оригинального Reel URL. Не скачиваю её через direct-curl: это обычно HTML/login/rate-limit страница. Пересоздай задачу через Instagram source или используй оригинальную ссылку вида https://www.instagram.com/reel/...",
    );
  }

  if (!isYoutubeUrl(input.sourceUrl)) {
    return downloadDirectSource(input);
  }

  try {
    return await downloadViaRipYoutube(input);
  } catch (error) {
    console.error("RIP downloader failed", error);

    await input.onProgress?.(
      3,
      "RIP-сервис не сработал, пробую запасной способ",
    );

    return downloadYoutubeSourceWithYtDlp(input);
  }
}

export async function getSourceDuration(sourcePath: string) {
  return getVideoDurationSeconds(sourcePath);
}

type RenderFactoryClipInput = {
  jobId: string;
  clipIndex: number;
  sourcePath: string;
  lanaPath: string;
  startSec: number;
  clipSeconds: number;
  template: FactoryRenderTemplate;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
};

export async function renderFactoryClip(input: RenderFactoryClipInput) {
  await ensureFactoryDirs();

  const tempId = `${input.jobId}-${input.clipIndex}-${nanoid(8)}`;
  const tempDir = path.join(FACTORY_TEMP_DIR, tempId);

  const outputPath = path.join(
    FACTORY_OUTPUT_DIR,
    `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.mp4`,
  );
  const baseOutputPath = isGlobalOverlayEnabled()
    ? path.join(
        tempDir,
        `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.base.mp4`,
      )
    : outputPath;

  await mkdir(tempDir, { recursive: true });

  try {
    await runCommand(
      "ffmpeg",
      [
        "-y",

        "-ss",
        String(input.startSec),
        "-t",
        String(input.clipSeconds),
        "-i",
        input.sourcePath,

        "-stream_loop",
        "-1",
        "-t",
        String(input.clipSeconds),
        "-i",
        input.lanaPath,

        "-filter_complex",
        buildRenderFilter(input.template),

        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-r",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        baseOutputPath,
      ],
      {
        logPrefix: `ffmpeg-${input.clipIndex}`,
        isCanceled: input.isCanceled,
      },
    );

    if (baseOutputPath !== outputPath) {
      const applied = await applyGlobalOverlayToVideo({
        inputPath: baseOutputPath,
        outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      if (!applied) {
        await copyFile(baseOutputPath, outputPath);
      }
    }

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function renderCenteredMovieClip(
  input: Omit<RenderFactoryClipInput, "lanaPath" | "template">,
) {
  await ensureFactoryDirs();

  const tempId = `${input.jobId}-${input.clipIndex}-movie-${nanoid(8)}`;
  const tempDir = path.join(FACTORY_TEMP_DIR, tempId);

  const outputPath = path.join(
    FACTORY_OUTPUT_DIR,
    `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.mp4`,
  );
  const needsSubtitles = areMovieSubtitlesEnabled();
  const needsOverlay = isGlobalOverlayEnabled();
  const rawOutputPath =
    needsSubtitles || needsOverlay
      ? path.join(
          tempDir,
          `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.movie.raw.mp4`,
        )
      : outputPath;

  await mkdir(tempDir, { recursive: true });

  try {
    await input.onProgress?.(56, "Увеличиваю кадр фильма");

    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(input.startSec),
        "-t",
        String(input.clipSeconds),
        "-i",
        input.sourcePath,
        "-filter_complex",
        buildCenteredMovieFilter(),
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-r",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        rawOutputPath,
      ],
      {
        logPrefix: `ffmpeg-movie-${input.clipIndex}`,
        isCanceled: input.isCanceled,
      },
    );

    let currentPath = rawOutputPath;

    if (needsSubtitles) {
      const subtitledPath = needsOverlay
        ? path.join(
            tempDir,
            `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.movie.subtitled.mp4`,
          )
        : outputPath;
      const subtitlesApplied = await burnMovieSubtitles({
        inputPath: currentPath,
        outputPath: subtitledPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      if (subtitlesApplied) {
        currentPath = subtitledPath;
      }
    }

    if (needsOverlay) {
      const overlayApplied = await applyGlobalOverlayToVideo({
        inputPath: currentPath,
        outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      if (!overlayApplied) {
        await copyFile(currentPath, outputPath);
      }
    } else if (currentPath !== outputPath) {
      await copyFile(currentPath, outputPath);
    }

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function renderInstagramReadyShortClip(
  input: Omit<RenderFactoryClipInput, "lanaPath" | "template">,
) {
  await ensureFactoryDirs();

  const tempId = `${input.jobId}-${input.clipIndex}-instagram-${nanoid(8)}`;
  const tempDir = path.join(FACTORY_TEMP_DIR, tempId);
  const outputPath = path.join(
    FACTORY_OUTPUT_DIR,
    `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.mp4`,
  );
  const needsOverlay = isGlobalOverlayEnabled();
  const rawOutputPath = needsOverlay
    ? path.join(tempDir, `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.instagram.raw.mp4`)
    : outputPath;

  await mkdir(tempDir, { recursive: true });

  try {
    await input.onProgress?.(56, "Готовлю Instagram Reel без масштабирования");

    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-ss",
        String(input.startSec),
        "-t",
        String(input.clipSeconds),
        "-i",
        input.sourcePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-pix_fmt",
        "yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        "-shortest",
        rawOutputPath,
      ],
      {
        logPrefix: `ffmpeg-instagram-noscale-${input.clipIndex}`,
        isCanceled: input.isCanceled,
      },
    );

    if (needsOverlay) {
      const overlayApplied = await applyGlobalOverlayToVideo({
        inputPath: rawOutputPath,
        outputPath,
        isCanceled: input.isCanceled,
        onProgress: input.onProgress,
      });

      if (!overlayApplied) {
        await copyFile(rawOutputPath, outputPath);
      }
    }

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
