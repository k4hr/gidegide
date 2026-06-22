import { existsSync } from "node:fs";
import path from "node:path";

import { MOVIE_SMART_CONFIG } from "./movie-smart-config";
import { runCommand } from "./video";

type CancelCheck = () => Promise<boolean>;
type ProgressCallback = (progress: number, label: string) => Promise<void>;

type OverlayTransparencyMode = "alpha" | "black-key";

export type GlobalOverlayConfig = {
  enabled: boolean;
  overlayPath: string;
  mode: "fullscreen";
  loop: boolean;
  transparencyMode: OverlayTransparencyMode;
  softFail: boolean;
  crf: number;
};

function resolveProjectPath(filePath: string) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(process.cwd(), filePath);
}

export function getGlobalOverlayConfig(): GlobalOverlayConfig {
  return {
    enabled: MOVIE_SMART_CONFIG.overlayEnabled,
    overlayPath: resolveProjectPath(MOVIE_SMART_CONFIG.overlayPath),
    mode: "fullscreen",
    loop: MOVIE_SMART_CONFIG.overlayLoop,
    transparencyMode: MOVIE_SMART_CONFIG.overlayTransparency,
    softFail: MOVIE_SMART_CONFIG.overlaySoftFail,
    crf: MOVIE_SMART_CONFIG.overlayCrf,
  };
}

export function isGlobalOverlayEnabled() {
  return getGlobalOverlayConfig().enabled;
}

function buildOverlayFilter(transparencyMode: OverlayTransparencyMode) {
  // Keep this as explicit ffmpeg filter strings, not an array join.
  // A previous dynamic join could produce an empty filter segment on Linux ffmpeg
  // and fail with: No such filter: ''.
  const overlayBase =
    "[1:v]fps=30," +
    "scale=1080:1920:force_original_aspect_ratio=increase," +
    "crop=1080:1920," +
    "setsar=1," +
    "format=rgba";

  const overlayPrep =
    transparencyMode === "black-key"
      ? `${overlayBase},colorkey=0x000000:0.10:0.04[ov]`
      : `${overlayBase}[ov]`;

  return `${overlayPrep};[0:v][ov]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]`;
}

export async function applyGlobalOverlayToVideo(input: {
  inputPath: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const config = getGlobalOverlayConfig();

  console.log("[OVERLAY] enabled", { enabled: config.enabled });

  if (!config.enabled) {
    return false;
  }

  const inputExists = existsSync(input.inputPath);
  const overlayExists = existsSync(config.overlayPath);

  console.log("[OVERLAY] input exists", {
    inputPath: input.inputPath,
    exists: inputExists,
  });
  console.log("[OVERLAY] overlay exists", {
    overlayPath: config.overlayPath,
    exists: overlayExists,
  });

  if (!inputExists) {
    throw new Error(`Input video file not found for REDFILM overlay: ${input.inputPath}`);
  }

  if (!overlayExists) {
    const message = `REDFILM overlay file not found: ${MOVIE_SMART_CONFIG.overlayPath}`;

    if (config.softFail) {
      console.warn(`[OVERLAY] ${message}`);
      return false;
    }

    throw new Error(message);
  }

  await input.onProgress?.(72, "Накладываю REDFILM overlay");

  console.log("[OVERLAY] ffmpeg start", {
    transparencyMode: config.transparencyMode,
    loop: config.loop,
    crf: config.crf,
  });

  const overlayInputArgs = config.loop ? ["-stream_loop", "-1"] : [];
  const filterComplex = buildOverlayFilter(config.transparencyMode);

  console.log("[OVERLAY] filter", { filterComplex });

  try {
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i",
        input.inputPath,
        ...overlayInputArgs,
        "-i",
        config.overlayPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        String(config.crf),
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
        input.outputPath,
      ],
      {
        logPrefix: "factory-overlay",
        isCanceled: input.isCanceled,
      },
    );

    const outputExists = existsSync(input.outputPath);
    console.log("[OVERLAY] ffmpeg done", { outputPath: input.outputPath });
    console.log("[OVERLAY] output exists", {
      outputPath: input.outputPath,
      exists: outputExists,
    });

    if (!outputExists) {
      throw new Error(`REDFILM overlay output was not created: ${input.outputPath}`);
    }

    await input.onProgress?.(74, "Overlay добавлен");
    return true;
  } catch (error) {
    if (!config.softFail) {
      throw error;
    }

    console.error("[OVERLAY] failed, using video without overlay", error);
    return false;
  }
}
