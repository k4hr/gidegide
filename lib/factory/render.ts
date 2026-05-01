import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { nanoid } from "nanoid";

import {
  FACTORY_OUTPUT_DIR,
  FACTORY_SOURCE_DIR,
  FACTORY_TEMP_DIR,
  ensureFactoryDirs,
} from "@/lib/factory/paths";
import { getVideoDurationSeconds, runCommand } from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;

type CancelCheck = () => Promise<boolean>;

export async function downloadYoutubeSource(input: {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
}) {
  await ensureFactoryDirs();

  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);

  await input.onProgress?.(2, "Начинаю скачивать исходник");

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
          `Скачивание исходника: ${downloadPercent.toFixed(1)}%`,
        );
      },
    },
  );

  await input.onProgress?.(30, "Исходник скачан");

  return outputPath;
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
        [
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=18:1[bg]",
          "[0:v]scale=1080:1080:force_original_aspect_ratio=decrease[game]",
          "[bg][game]overlay=(W-w)/2:260[base]",
          "[1:v]scale=330:586:force_original_aspect_ratio=increase,crop=330:586[lana]",
          "[base][lana]overlay=W-w-32:H-h-32[v]",
        ].join(";"),

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
