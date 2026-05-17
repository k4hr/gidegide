import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";

import {
  FACTORY_OUTPUT_DIR,
  FACTORY_SOURCE_DIR,
  FACTORY_TEMP_DIR,
  ensureFactoryDirs,
} from "@/lib/factory/paths";
import { downloadViaRipYoutube, isYoutubeUrl } from "@/lib/factory/rip-downloader";
import { prepareStoryTextAsset } from "@/lib/factory/story-emoji";
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
  facecamPosition?: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
  facecamWidthPercent?: number;
  facecamMarginPercent?: number;
  facecamBorderRadius?: number;
  facecamCropZoomPercent?: number;
  facecamCropFocusXPercent?: number;
  facecamCropFocusYPercent?: number;
};

type RenderVariant = {
  thumbnailSeconds: number;
};

function createSeed(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededUnit(seed: number, salt: number) {
  const mixed =
    Math.imul(seed ^ Math.imul(salt + 1, 2246822519), 3266489917) >>> 0;

  return mixed / 4294967295;
}

function getRenderVariant(input: {
  jobId: string;
  clipIndex: number;
  clipSeconds: number;
}) {
  const seed = createSeed(`${input.jobId}:${input.clipIndex}:${input.clipSeconds}`);

  return {
    thumbnailSeconds: Number((0.09 + seededUnit(seed, 1) * 0.03).toFixed(3)),
  } satisfies RenderVariant;
}

function buildCenteredHalfCropChain(input?: { mirror?: boolean }) {
  return [
    "scale=1080:960:force_original_aspect_ratio=increase",
    "crop=1080:960:(iw-1080)/2:(ih-960)/2",
    input?.mirror ? "hflip" : null,
    "setsar=1",
  ]
    .filter(Boolean)
    .join(",");
}

function buildThumbnailCropChain() {
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920:(iw-1080)/2:(ih-1920)/2",
    "setsar=1",
    "format=yuv420p",
    "fps=30",
  ].join(",");
}


function buildFullScreenCropChain() {
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920:(iw-1080)/2:(ih-1920)/2",
    "setsar=1",
    "format=yuv420p",
    "fps=30",
  ].join(",");
}

function escapeDrawText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .slice(0, 64);
}

function escapeFilterPath(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildHookDrawText(text: string) {
  const safeText = escapeDrawText(text || "WAIT FOR IT");

  return [
    `drawtext=text='${safeText}'`,
    "fontcolor=white",
    "fontsize=76",
    "borderw=7",
    "bordercolor=black",
    "shadowcolor=black@0.65",
    "shadowx=3",
    "shadowy=3",
    "x=(w-text_w)/2",
    "y=150",
  ].join(":");
}

function buildAiHookFilter(input: {
  template: FactoryRenderTemplate;
  overlayText: string;
}) {
  return [
    `[0:v]${buildFullScreenCropChain()},${buildHookDrawText(input.overlayText)}[hookv]`,
    `[1:v]${buildCenteredHalfCropChain()}[game]`,
    `[2:v]${buildCenteredHalfCropChain({ mirror: input.template.mirrorLana })}[person]`,
    "[game][person]vstack=inputs=2,format=yuv420p,fps=30[stackv]",
    "[hookv][stackv]concat=n=2:v=1:a=0,format=yuv420p[v]",
    "[0:a]asetpts=PTS-STARTPTS[hooka]",
    "[1:a]asetpts=PTS-STARTPTS[maina]",
    "[hooka][maina]concat=n=2:v=0:a=1[a]",
  ].join(";");
}

function buildBaseStackFilter(template: FactoryRenderTemplate) {
  return [
    `[0:v]${buildCenteredHalfCropChain()}[game]`,
    `[1:v]${buildCenteredHalfCropChain({
      mirror: template.mirrorLana,
    })}[person]`,
    "[game][person]vstack=inputs=2,format=yuv420p,fps=30[stack_raw]",
  ].join(";");
}

function buildRenderFilter(input: {
  template: FactoryRenderTemplate;
  variant: RenderVariant;
  hasThumbnail: boolean;
}) {
  const baseStackFilter = buildBaseStackFilter(input.template);

  if (!input.hasThumbnail) {
    return `${baseStackFilter};[stack_raw]format=yuv420p[v]`;
  }

  return [
    baseStackFilter,
    `[2:v]${buildThumbnailCropChain()},trim=duration=${input.variant.thumbnailSeconds.toFixed(
      3,
    )},setpts=PTS-STARTPTS[thumb]`,
    `[stack_raw]trim=start=${input.variant.thumbnailSeconds.toFixed(
      3,
    )},setpts=PTS-STARTPTS[stack_cut]`,
    "[thumb][stack_cut]concat=n=2:v=1:a=0,format=yuv420p[v]",
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
  thumbnailPath?: string | null;
  hookPreview?: {
    startSec: number;
    durationSec: number;
    overlayText: string;
  } | null;
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

    if (input.hookPreview) {
      const previewDuration = Math.max(3, Math.min(10, input.hookPreview.durationSec));
      const mainDuration = Math.max(1, input.clipSeconds - previewDuration);
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(Math.max(0, input.hookPreview.startSec)),
        "-t",
        String(previewDuration),
        "-i",
        input.sourcePath,
        "-ss",
        String(Math.max(0, input.startSec)),
        "-t",
        String(mainDuration),
        "-i",
        input.sourcePath,
        "-stream_loop",
        "-1",
        "-t",
        String(mainDuration),
        "-i",
        input.lanaPath,
        "-filter_complex",
        buildAiHookFilter({
          template: input.template,
          overlayText: input.hookPreview.overlayText,
        }),
        "-map",
        "[v]",
        "-map",
        "[a]",
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
        "-movflags",
        "+faststart",
        "-shortest",
        outputPath,
      ];

      await runCommand("ffmpeg", args, {
        logPrefix: `ffmpeg-ai-hook-${input.clipIndex}`,
        isCanceled: input.isCanceled,
      });

      await assertVideoHasAudio(outputPath);

      return outputPath;
    }

    const variant = getRenderVariant({
      jobId: input.jobId,
      clipIndex: input.clipIndex,
      clipSeconds: input.clipSeconds,
    });

    const hasThumbnail = Boolean(input.thumbnailPath);

    const args = [
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
    ];

    if (input.thumbnailPath) {
      args.push(
        "-loop",
        "1",
        "-t",
        String(variant.thumbnailSeconds),
        "-i",
        input.thumbnailPath,
      );
    }

    args.push(
      "-filter_complex",
      buildRenderFilter({
        template: input.template,
        variant,
        hasThumbnail,
      }),
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
      "-movflags",
      "+faststart",
      "-shortest",
      outputPath,
    );

    await runCommand("ffmpeg", args, {
      logPrefix: `ffmpeg-${input.clipIndex}`,
      isCanceled: input.isCanceled,
    });

    await assertVideoHasAudio(outputPath);

    return outputPath;
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true,
    });
  }
}

function buildLongVideoMainChain() {
  return [
    "scale=1920:1080:force_original_aspect_ratio=increase",
    "crop=1920:1080:(iw-1920)/2:(ih-1080)/2",
    "setsar=1",
    "format=yuv420p",
    "fps=30",
  ].join(",");
}

function buildLongVideoFacecamChain(template: FactoryRenderTemplate) {
  const widthPercent = Math.max(12, Math.min(40, template.facecamWidthPercent ?? 24));
  const width = Math.round((1920 * widthPercent) / 100);
  const height = Math.round((width * 9) / 16);

  // 100 = обычный cover. 130-160 = сильнее приблизить реакцию и отрезать боковые края,
  // чтобы в окне остался центр кадра с персонажем, а не весь широкий 16:9 источник.
  const zoomPercent = Math.max(100, Math.min(250, template.facecamCropZoomPercent ?? 135));
  const focusX = Math.max(0, Math.min(100, template.facecamCropFocusXPercent ?? 50));
  const focusY = Math.max(0, Math.min(100, template.facecamCropFocusYPercent ?? 50));
  const scaledWidth = Math.round((width * zoomPercent) / 100);
  const scaledHeight = Math.round((height * zoomPercent) / 100);

  return [
    `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}:(iw-${width})*${focusX}/100:(ih-${height})*${focusY}/100`,
    template.mirrorLana ? "hflip" : null,
    "setsar=1",
    "format=rgba",
  ]
    .filter(Boolean)
    .join(",");
}

function getFacecamOverlayPosition(template: FactoryRenderTemplate) {
  const marginPercent = Math.max(1, Math.min(10, template.facecamMarginPercent ?? 3));
  const marginX = Math.round((1920 * marginPercent) / 100);
  const marginY = Math.round((1080 * marginPercent) / 100);
  const position = template.facecamPosition ?? "TOP_LEFT";

  if (position === "TOP_RIGHT") return `main_w-overlay_w-${marginX}:${marginY}`;
  if (position === "BOTTOM_LEFT") return `${marginX}:main_h-overlay_h-${marginY}`;
  if (position === "BOTTOM_RIGHT") return `main_w-overlay_w-${marginX}:main_h-overlay_h-${marginY}`;

  return `${marginX}:${marginY}`;
}

function buildLongVideo16x9Filter(template: FactoryRenderTemplate) {
  return [
    `[0:v]${buildLongVideoMainChain()}[base]`,
    `[1:v]${buildLongVideoFacecamChain(template)}[face]`,
    `[base][face]overlay=${getFacecamOverlayPosition(template)}:format=auto,format=yuv420p[v]`,
  ].join(";");
}

export async function renderLongVideo16x9(input: {
  jobId: string;
  sourcePath: string;
  reactionPath: string;
  template: FactoryRenderTemplate;
  isCanceled?: CancelCheck;
}) {
  await ensureFactoryDirs();
  await assertSourceAudioOrThrow(input.sourcePath);

  const outputPath = path.join(FACTORY_OUTPUT_DIR, `${input.jobId}-long-16x9.mp4`);
  const duration = await getVideoDurationSeconds(input.sourcePath);

  await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input.sourcePath,
      "-stream_loop",
      "-1",
      "-t",
      String(duration),
      "-i",
      input.reactionPath,
      "-filter_complex",
      buildLongVideo16x9Filter(input.template),
      "-map",
      "[v]",
      "-map",
      "0:a:0",
      "-t",
      String(duration),
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
      "-b:a",
      "160k",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    {
      logPrefix: `ffmpeg-long-${input.jobId}`,
      isCanceled: input.isCanceled,
    },
  );

  await assertVideoHasAudio(outputPath);

  return outputPath;
}

function buildStoryCropChain() {
  return [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920:(iw-1080)/2:(ih-1920)/2",
    "setsar=1",
    "format=yuv420p",
    "fps=30",
  ].join(",");
}

type StoryBeatRenderAsset = {
  text: string;
  textFilePath: string | null;
  emojiFilePaths: string[];
  y: number;
  fontSize: number;
  emojiY: number;
  emojiBaseX: number;
  emojiSize: number;
  startSec: number;
  endSec: number;
};

function buildStoryDrawTextFilter(input: {
  textFilePath: string;
  y: number;
  fontSize: number;
  startSec?: number;
  endSec?: number;
}) {
  const parts = [
    `drawtext=textfile='${escapeFilterPath(input.textFilePath)}'`,
    "reload=1",
    "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "fontcolor=white",
    `fontsize=${input.fontSize}`,
    "borderw=8",
    "bordercolor=black",
    "shadowcolor=black@0.8",
    "shadowx=4",
    "shadowy=4",
    "line_spacing=12",
    "x=(w-text_w)/2",
    `y=${input.y}`,
  ];

  if (typeof input.startSec === "number" && typeof input.endSec === "number") {
    parts.push(
      `enable='between(t,${Math.max(0, input.startSec).toFixed(2)},${Math.max(input.startSec + 0.2, input.endSec).toFixed(2)})'`,
    );
  }

  return parts.join(":");
}

function buildStoryVideoFilter(input: {
  beats: StoryBeatRenderAsset[];
}) {
  const filters: string[] = [];
  let currentLabel = "storybase0";
  filters.push(`[0:v]${buildStoryCropChain()}[${currentLabel}]`);

  let sequence = 0;

  for (const beat of input.beats) {
    if (beat.textFilePath) {
      const nextLabel = `storytxt${sequence}`;
      filters.push(
        `[${currentLabel}]${buildStoryDrawTextFilter({
          textFilePath: beat.textFilePath,
          y: beat.y,
          fontSize: beat.fontSize,
          startSec: beat.startSec,
          endSec: beat.endSec,
        })}[${nextLabel}]`,
      );
      currentLabel = nextLabel;
      sequence += 1;
    }

    for (let emojiIndex = 0; emojiIndex < beat.emojiFilePaths.length; emojiIndex += 1) {
      const movieLabel = `storyemo${sequence}_${emojiIndex}`;
      const nextLabel = `storyov${sequence}_${emojiIndex}`;
      const emojiSpacing = beat.emojiSize + 14;
      const centerOffset = Math.round(
        (emojiIndex - (beat.emojiFilePaths.length - 1) / 2) * emojiSpacing,
      );
      const emojiX = `(w-overlay_w)/2${centerOffset >= 0 ? `+${centerOffset}` : `${centerOffset}`}`;
      filters.push(
        `movie='${escapeFilterPath(beat.emojiFilePaths[emojiIndex])}',scale=${beat.emojiSize}:-1[${movieLabel}]`,
      );
      filters.push(
        `[${currentLabel}][${movieLabel}]overlay=x=${emojiX}:y=${beat.emojiY}:enable='between(t,${Math.max(0, beat.startSec).toFixed(2)},${Math.max(beat.startSec + 0.2, beat.endSec).toFixed(2)})'[${nextLabel}]`,
      );
      currentLabel = nextLabel;
      sequence += 1;
    }
  }

  filters.push(`[${currentLabel}]format=yuv420p[v]`);
  return filters.join(";");
}

async function prepareStoryBeatAssets(input: {
  tempDir: string;
  clipSeconds: number;
  overlayText: string;
  conflictText?: string | null;
  escalationText?: string | null;
  punchlineText?: string | null;
  secondaryText?: string | null;
}) {
  const clipSeconds = Math.max(10, input.clipSeconds);
  const hookEnd = Math.max(3.5, Math.min(clipSeconds * 0.32, 9));
  const conflictStart = Math.max(2.5, hookEnd - 0.4);
  const conflictEnd = Math.max(conflictStart + 2.5, Math.min(clipSeconds * 0.58, hookEnd + 8));
  const escalationStart = Math.max(conflictStart + 2, conflictEnd - 0.35);
  const escalationEnd = Math.max(escalationStart + 2.5, Math.min(clipSeconds * 0.82, escalationStart + 8));
  const punchlineStart = Math.max(escalationStart + 2, escalationEnd - 0.35);

  const beats = [
    {
      name: "hook",
      rawText: input.overlayText,
      y: 120,
      fontSize: 82,
      emojiY: 1480,
      emojiBaseX: 0,
      emojiSize: 94,
      startSec: 0,
      endSec: hookEnd,
    },
    {
      name: "conflict",
      rawText: input.conflictText ?? "",
      y: 215,
      fontSize: 72,
      emojiY: 1480,
      emojiBaseX: 0,
      emojiSize: 88,
      startSec: conflictStart,
      endSec: conflictEnd,
    },
    {
      name: "escalation",
      rawText: input.escalationText ?? "",
      y: 215,
      fontSize: 72,
      emojiY: 1480,
      emojiBaseX: 0,
      emojiSize: 88,
      startSec: escalationStart,
      endSec: escalationEnd,
    },
    {
      name: "punchline",
      rawText: input.punchlineText || input.secondaryText || "",
      y: input.punchlineText ? 1260 : 1490,
      fontSize: input.punchlineText ? 70 : 56,
      emojiY: 150,
      emojiBaseX: 0,
      emojiSize: input.punchlineText ? 88 : 74,
      startSec: punchlineStart,
      endSec: clipSeconds + 0.1,
    },
  ];

  const prepared: StoryBeatRenderAsset[] = [];

  for (const beat of beats) {
    const asset = prepareStoryTextAsset(beat.rawText);
    let textFilePath: string | null = null;

    if (asset.cleanText) {
      textFilePath = path.join(input.tempDir, `${beat.name}.txt`);
      await writeFile(textFilePath, asset.cleanText, "utf8");
    }

    prepared.push({
      text: asset.cleanText,
      textFilePath,
      emojiFilePaths: asset.emojiFiles.map((fileName) =>
        path.join(process.cwd(), "public", "factory", "emoji", fileName),
      ),
      y: beat.y,
      fontSize: beat.fontSize,
      emojiY: beat.emojiY,
      emojiBaseX: beat.emojiBaseX,
      emojiSize: beat.emojiSize,
      startSec: beat.startSec,
      endSec: beat.endSec,
    });
  }

  return prepared.filter((beat) => beat.textFilePath || beat.emojiFilePaths.length > 0);
}

export async function renderRobloxStoryShort(input: {
  jobId: string;
  clipIndex: number;
  sourcePath: string;
  startSec: number;
  clipSeconds: number;
  overlayText: string;
  conflictText?: string | null;
  escalationText?: string | null;
  punchlineText?: string | null;
  secondaryText?: string | null;
  musicPath?: string | null;
  sourceAudioVolumePercent?: number | null;
  musicStartSec?: number | null;
  isCanceled?: CancelCheck;
}) {
  await ensureFactoryDirs();

  const outputPath = path.join(
    FACTORY_OUTPUT_DIR,
    `${input.jobId}-story-${String(input.clipIndex).padStart(4, "0")}.mp4`,
  );

  const sourceVolume = Math.max(0, Math.min(100, input.sourceAudioVolumePercent ?? 10)) / 100;
  const tempDir = path.join(
    FACTORY_TEMP_DIR,
    `${input.jobId}-story-render-${String(input.clipIndex).padStart(4, "0")}-${nanoid(6)}`,
  );

  await mkdir(tempDir, { recursive: true });

  try {
    const beats = await prepareStoryBeatAssets({
      tempDir,
      clipSeconds: input.clipSeconds,
      overlayText: input.overlayText,
      conflictText: input.conflictText,
      escalationText: input.escalationText,
      punchlineText: input.punchlineText,
      secondaryText: input.secondaryText,
    });
    const videoFilter = buildStoryVideoFilter({ beats });

    if (input.musicPath) {
      const musicStart = Math.max(0, Math.round(input.musicStartSec ?? 0));
      const audioFilter = [
        `[0:a]asetpts=PTS-STARTPTS,volume=${sourceVolume.toFixed(2)}[srca]`,
        `[1:a]atrim=start=${musicStart}:duration=${input.clipSeconds},asetpts=PTS-STARTPTS,volume=0.95,afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0, input.clipSeconds - 1)}:d=1[musica]`,
        "[srca][musica]amix=inputs=2:duration=first:dropout_transition=0,volume=1.0[a]",
      ].join(";");

      await runCommand(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(input.startSec),
          "-t",
          String(input.clipSeconds),
          "-i",
          input.sourcePath,
          "-stream_loop",
          "-1",
          "-i",
          input.musicPath,
          "-filter_complex",
          `${videoFilter};${audioFilter}`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-t",
          String(input.clipSeconds),
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
          "-b:a",
          "160k",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { logPrefix: `ffmpeg-story-${input.clipIndex}`, isCanceled: input.isCanceled },
      );
    } else {
      await runCommand(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(input.startSec),
          "-t",
          String(input.clipSeconds),
          "-i",
          input.sourcePath,
          "-filter_complex",
          `${videoFilter};[0:a]volume=${sourceVolume.toFixed(2)}[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]",
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
          "-b:a",
          "128k",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          outputPath,
        ],
        { logPrefix: `ffmpeg-story-${input.clipIndex}`, isCanceled: input.isCanceled },
      );
    }

    await assertVideoHasAudio(outputPath);
    return outputPath;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
