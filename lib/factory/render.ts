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
import {
  assertVideoHasAudio,
  getVideoDurationSeconds,
  hasAudioStream,
  runCommand,
} from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

export type FactoryRenderTemplate = {
  mirrorLana: boolean;
};

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

async function assertSourceAudioOrThrow(filePath: string) {
  const hasAudio = await hasAudioStream(filePath);

  if (!hasAudio) {
    throw new Error(
      "В исходном игровом видео нет звука. Дай другое видео или ссылку, где доступен 720p MP4 со звуком.",
    );
  }
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

  await assertSourceAudioOrThrow(outputPath);
  await input.onProgress?.(30, "Исходный файл скачан, звук найден");

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

  await rm(outputPath, {
    force: true,
  });

  await input.onProgress?.(2, "Пробую скачать через yt-dlp в 720p со звуком");

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
      "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720][ext=mp4]/best[height<=720]",
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
        const percentMatch = text.match(/\[download]\s+(\d+(?:\.\d+)?)%/);
        const downloadPercent = percentMatch?.[1]
          ? Number(percentMatch[1])
          : null;

        if (downloadPercent === null || Number.isNaN(downloadPercent)) {
          return;
        }

        const totalProgress = Math.min(
          30,
          Math.max(3, 3 + Math.round(downloadPercent * 0.3)),
        );

        await input.onProgress?.(
          totalProgress,
          `Скачивание yt-dlp 720p со звуком: ${downloadPercent.toFixed(1)}%`,
        );
      },
    },
  );

  await assertVideoHasAudio(outputPath);
  await input.onProgress?.(30, "YouTube-исходник скачан в 720p со звуком");

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
    const ripPath = await downloadViaRipYoutube(input);

    await assertVideoHasAudio(ripPath);
    await input.onProgress?.(30, "RIP скачал 720p MP4 со звуком");

    return ripPath;
  } catch (error) {
    console.error("RIP downloader failed or downloaded video without audio", error);

    await input.onProgress?.(
      3,
      "RIP не дал 720p со звуком, пробую запасной способ через yt-dlp",
    );

    try {
      return await downloadYoutubeSourceWithYtDlp(input);
    } catch (ytDlpError) {
      console.error("yt-dlp failed or downloaded video without audio", ytDlpError);

      throw new Error(
        "Не получилось скачать это YouTube-видео в 720p со звуком. Дай другое видео: у этого источника звук недоступен для скачивания.",
      );
    }
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
    await assertSourceAudioOrThrow(input.sourcePath);

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
        "0:a:0",
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
        "-b:a",
        "128k",
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

    await assertVideoHasAudio(outputPath);

    return outputPath;
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}
