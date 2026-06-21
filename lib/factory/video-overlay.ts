import { existsSync } from "node:fs";
import path from "node:path";

import { runCommand } from "@/lib/factory/video";

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
};

function envFlag(name: string, defaultValue: boolean) {
  const value = process.env[name];

  if (value == null || value.trim() === "") {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function envString(name: string, defaultValue: string) {
  const value = process.env[name];
  return value == null || value.trim() === "" ? defaultValue : value.trim();
}

function resolveProjectPath(filePath: string) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  return path.join(process.cwd(), filePath);
}

export function getGlobalOverlayConfig(): GlobalOverlayConfig {
  const overlayPath = resolveProjectPath(
    envString(
      "FACTORY_GLOBAL_OVERLAY_PATH",
      "public/factory/overlays/redfilm-overlay.mov",
    ),
  );

  const configuredTransparencyMode = envString(
    "FACTORY_GLOBAL_OVERLAY_TRANSPARENCY",
    "black-key",
  ).toLowerCase();

  const transparencyMode: OverlayTransparencyMode =
    configuredTransparencyMode === "alpha" ? "alpha" : "black-key";

  return {
    enabled: envFlag("FACTORY_GLOBAL_OVERLAY_ENABLED", existsSync(overlayPath)),
    overlayPath,
    mode: "fullscreen",
    loop: envFlag("FACTORY_GLOBAL_OVERLAY_LOOP", true),
    transparencyMode,
    softFail: envFlag("FACTORY_GLOBAL_OVERLAY_SOFT_FAIL", true),
  };
}

export function isGlobalOverlayEnabled() {
  const config = getGlobalOverlayConfig();
  return config.enabled && existsSync(config.overlayPath);
}

function buildOverlayFilter(transparencyMode: OverlayTransparencyMode) {
  const overlayPrep = [
    "[1:v]fps=30",
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "setsar=1",
    "format=rgba",
    transparencyMode === "black-key" ? "colorkey=0x000000:0.10:0.04" : null,
    "[ov]",
  ]
    .filter(Boolean)
    .join(",");

  return [
    overlayPrep,
    "[0:v][ov]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]",
  ].join(";");
}

export async function applyGlobalOverlayToVideo(input: {
  inputPath: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  const config = getGlobalOverlayConfig();

  if (!config.enabled) {
    return false;
  }

  if (!existsSync(config.overlayPath)) {
    const message = `Overlay включён, но файл не найден: ${config.overlayPath}`;

    if (config.softFail) {
      console.warn(`[FACTORY_OVERLAY] ${message}`);
      return false;
    }

    throw new Error(message);
  }

  await input.onProgress?.(72, "Накладываю REDFILM overlay");

  console.log("[FACTORY_OVERLAY] applying", {
    overlayPath: config.overlayPath,
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    transparencyMode: config.transparencyMode,
    loop: config.loop,
  });

  const overlayInputArgs = config.loop ? ["-stream_loop", "-1"] : [];

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
        buildOverlayFilter(config.transparencyMode),
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
        envString("FACTORY_GLOBAL_OVERLAY_CRF", "22"),
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

    await input.onProgress?.(74, "REDFILM overlay добавлен");
    return true;
  } catch (error) {
    if (!config.softFail) {
      throw error;
    }

    console.error("[FACTORY_OVERLAY] failed, using video without overlay", error);
    return false;
  }
}
