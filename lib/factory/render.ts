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

export async function downloadYoutubeSource(jobId: string, sourceUrl: string) {
  await ensureFactoryDirs();

  const outputPath = path.join(FACTORY_SOURCE_DIR, `${jobId}.mp4`);

  await runCommand("yt-dlp", [
    "-f",
    "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
    "--merge-output-format",
    "mp4",
    "-o",
    outputPath,
    sourceUrl,
  ]);

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
    await runCommand("ffmpeg", [
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
      "23",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-shortest",
      outputPath,
    ]);

    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
