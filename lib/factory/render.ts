import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { nanoid } from "nanoid";

import {
  FACTORY_OUTPUT_DIR,
  FACTORY_SOURCE_DIR,
  FACTORY_TEMP_DIR,
  ensureFactoryDirs,
} from "@/lib/factory/paths";
import { downloadViaRipYoutube, isYoutubeUrl } from "@/lib/factory/rip-downloader";
import { getVideoDurationSeconds, runCommand } from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

export type FactoryRenderTemplate = {
  lanaX: number;
  lanaY: number;
  lanaWidth: number;
  lanaHeight: number;
  mirrorLana: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildRenderFilter(template: FactoryRenderTemplate) {
  const lanaWidth = clamp(template.lanaWidth, 120, 760);
  const lanaHeight = clamp(template.lanaHeight, 120, 1200);

  const maxX = 1080 - lanaWidth;
  const maxY = 1920 - lanaHeight;

  const lanaX = Math.round((clamp(template.lanaX, 0, 100) / 100) * maxX);
  const lanaY = Math.round((clamp(template.lanaY, 0, 100) / 100) * maxY);

  const lanaFilters = [
    `scale=${lanaWidth}:${lanaHeight}:force_original_aspect_ratio=increase`,
    `crop=${lanaWidth}:${lanaHeight}`,
    template.mirrorLana ? "hflip" : null,
  ]
    .filter(Boolean)
    .join(",");

  return [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:1[bg]",
    "[0:v]scale=1080:1080:force_original_aspect_ratio=decrease[game]",
    "[bg][game]overlay=(W-w)/2:260[base]",
    `[1:v]${lanaFilters}[lana]`,
    `[base][lana]overlay=${lanaX}:${lanaY}[v]`,
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

  await input.onProgress?.(30, "Исходный файл скачан");

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
};

export async function renderFactoryClip(input: RenderFactoryClipInput) {
  await ensureFactoryDirs();

  const tempId = `${input.jobId}-${input.clipIndex}-${nanoid(8)}`;
  const tempDir = path.join(FACTORY_TEMP_DIR, tempId);

  const outputPath = path.join(
    FACTORY_OUTPUT_DIR,
    `${input.jobId}-${String(input.clipIndex).padStart(4, "0")}.mp4`,
  );

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
        outputPath,
      ],
      {
        logPrefix: `ffmpeg-${input.clipIndex}`,
        isCanceled: input.isCanceled,
      },
    );

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
