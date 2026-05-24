import fs from "node:fs";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import type { FactoryGame } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  FACTORY_LANA_DIR,
  FACTORY_MUSIC_DIR,
  FACTORY_SOURCE_DIR,
  FACTORY_THUMBNAILS_DIR,
} from "@/lib/factory/paths";
import {
  downloadSourceFromUrl,
  getSourceDuration,
  renderFactoryClip,
  renderLongVideo16x9,
  renderRobloxStoryShort,
  type FactoryRenderTemplate,
} from "@/lib/factory/render";
import { uploadYoutubeShort, uploadYoutubeVideo } from "@/lib/factory/youtube";
import { uploadTikTokDraft } from "@/lib/factory/tiktok";
import {
  downloadR2ObjectToFile,
  getR2Prefix,
  isMissingR2ObjectError,
  isR2Enabled,
  uploadFileToR2,
} from "@/lib/factory/r2";
import { buildClipDescription, buildClipTitle } from "@/lib/factory/games";
import { sanitizeFinalRobloxStoryTitle } from "@/lib/factory/roblox-story-uniqueness";
import { withDbRetry } from "@/lib/factory/db-retry";
import {
  buildSequentialClipStarts,
  buildSmartClipCandidates,
} from "@/lib/factory/smart-cut";
import {
  buildAiHookCutCandidates,
  type AiHookCutCandidate,
} from "@/lib/factory/ai-hook-cut";
import {
  buildRobloxStoryShortCandidates,
  type RobloxStoryCandidate,
} from "@/lib/factory/story-shorts";
import { makeUniqueRobloxStoryTitle } from "@/lib/factory/roblox-story-uniqueness";
import {
  decodeMovieMomentsTitlePrefix,
  generateUniqueMovieMomentTitle,
  isMovieMomentsTitlePrefix,
} from "@/lib/factory/movie-moments";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function db<T>(operation: () => Promise<T>) {
  return withDbRetry(operation, 5);
}

async function safeDb<T>(operation: () => Promise<T>) {
  try {
    return await db(operation);
  } catch (error) {
    console.error("Database operation failed after retries:", error);
    return null;
  }
}

async function updateJobProgress(jobId: string, progress: number, label: string) {
  await db(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        progressLabel: label,
      },
    }),
  );
}

async function isJobCanceled(jobId: string) {
  const job = await db(() =>
    prisma.factoryJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        cancelRequested: true,
        status: true,
      },
    }),
  );

  return Boolean(job?.cancelRequested || job?.status === "CANCELED");
}

async function assertNotCanceled(jobId: string) {
  const canceled = await isJobCanceled(jobId);

  if (canceled) {
    throw new Error("Задача отменена пользователем");
  }
}

async function markJobCanceled(jobId: string) {
  await safeDb(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        progressLabel: "Задача отменена",
      },
    }),
  );

  await safeDb(() =>
    prisma.factoryPublish.updateMany({
      where: {
        clip: {
          jobId,
        },
        status: {
          in: ["QUEUED", "UPLOADING"],
        },
      },
      data: {
        status: "CANCELED",
        error: "Задача отменена пользователем",
      },
    }),
  );
}

async function markJobFailed(jobId: string, error: unknown) {
  await safeDb(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
        progressLabel: "Ошибка",
      },
    }),
  );
}

async function ensureLocalSourceFile(job: {
  id: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceStorageKey: string | null;
}) {
  if (job.sourceFilePath && fs.existsSync(job.sourceFilePath)) {
    await updateJobProgress(job.id, 5, "Использую загруженный MP4");
    return job.sourceFilePath;
  }

  if (job.sourceStorageKey && isR2Enabled()) {
    await updateJobProgress(job.id, 5, "Скачиваю исходный MP4 из R2");

    const localPath = path.join(FACTORY_SOURCE_DIR, `${job.id}-source.mp4`);

    await downloadR2ObjectToFile({
      key: job.sourceStorageKey,
      filePath: localPath,
      purpose: `source video for job ${job.id}`,
    });

    await updateJobProgress(job.id, 30, "Исходный MP4 готов");

    return localPath;
  }

  if (job.sourceUrl) {
    return downloadSourceFromUrl({
      jobId: job.id,
      sourceUrl: job.sourceUrl,
      isCanceled: () => isJobCanceled(job.id),
      onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
    });
  }

  throw new Error("У задачи нет исходного MP4 и нет YouTube-ссылки");
}

function getDefaultTemplate(): FactoryRenderTemplate {
  return {
    mirrorLana: false,
    facecamPosition: "TOP_LEFT",
    facecamWidthPercent: 24,
    facecamMarginPercent: 3,
    facecamBorderRadius: 18,
    facecamCropZoomPercent: 135,
    facecamCropFocusXPercent: 50,
    facecamCropFocusYPercent: 50,
  };
}

function getTargetTemplate(target: {
  template: {
    mirrorLana: boolean;
    facecamPosition?: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
    facecamWidthPercent?: number;
    facecamMarginPercent?: number;
    facecamBorderRadius?: number;
    facecamCropZoomPercent?: number;
    facecamCropFocusXPercent?: number;
    facecamCropFocusYPercent?: number;
  } | null;
}): FactoryRenderTemplate {
  if (!target.template) {
    return getDefaultTemplate();
  }

  return {
    mirrorLana: target.template.mirrorLana,
    facecamPosition: target.template.facecamPosition ?? "TOP_LEFT",
    facecamWidthPercent: target.template.facecamWidthPercent ?? 24,
    facecamMarginPercent: target.template.facecamMarginPercent ?? 3,
    facecamBorderRadius: target.template.facecamBorderRadius ?? 18,
    facecamCropZoomPercent: target.template.facecamCropZoomPercent ?? 135,
    facecamCropFocusXPercent: target.template.facecamCropFocusXPercent ?? 50,
    facecamCropFocusYPercent: target.template.facecamCropFocusYPercent ?? 50,
  };
}

async function ensureLocalTemplateAssetFile(target: {
  template: {
    name: string;
    asset: {
      id: string;
      filePath: string;
      storageKey: string | null;
      title: string;
    } | null;
  } | null;
}) {
  const template = target.template;

  if (!template) {
    throw new Error(
      "У выбранного аккаунта не выбран шаблон. Выбери шаблон на странице /factory.",
    );
  }

  const asset = template.asset;

  if (!asset) {
    throw new Error(
      `У шаблона "${template.name}" не выбрано видео персонажа. Открой /factory/templates и привяжи видео к шаблону.`,
    );
  }

  if (fs.existsSync(asset.filePath)) {
    return asset.filePath;
  }

  if (!isR2Enabled() || !asset.storageKey) {
    throw new Error(
      `Видео "${asset.title}" из шаблона "${template.name}" не найдено локально и не сохранено в R2.`,
    );
  }

  await mkdir(FACTORY_LANA_DIR, { recursive: true });

  const localPath = path.join(FACTORY_LANA_DIR, `${asset.id}.mp4`);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  await downloadR2ObjectToFile({
    key: asset.storageKey,
    filePath: localPath,
    purpose: `template asset ${template.name} / ${asset.title}`,
  });

  return localPath;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}


function makeJobTitleUnique(input: {
  title: string;
  game: FactoryGame;
  sourceTitle?: string | null;
  clipIndex: number;
  usedTitles: Set<string>;
}) {
  let title = input.title.replace(/\s+/g, " ").trim();

  if (!/roblox/i.test(title)) {
    title = `Roblox: ${title}`;
  }

  const titleLower = title.toLowerCase();
  const isGenericTitle =
    !title ||
    /^roblox:\s*wait for (the )?ending$/i.test(title) ||
    /^roblox\s+(moment|moments|game|clip)?:?/i.test(title) ||
    titleLower === "roblox" ||
    titleLower === "roblox: nobody expected this ending" ||
    titleLower === "roblox: this got way too close" ||
    titleLower === "roblox: the ending changed everything" ||
    titleLower.includes("wait for the ending") ||
    titleLower.includes("watch till the end") ||
    titleLower.includes("he should not have survived") ||
    titleLower.includes("he almost lost everything") ||
    titleLower.includes("the final move saved the run") ||
    titleLower.includes("this clip turned insane") ||
    titleLower.includes("roblox moment");

  if (isGenericTitle) {
    title = buildClipTitle({
      game: input.game,
      clipIndex: input.clipIndex,
      customPrefix: "auto mix",
      seedHint: `${input.sourceTitle ?? "source"}:${input.clipIndex}:unique`,
      sourceTitle: input.sourceTitle,
    });
  }

  let candidate = title.slice(0, 95);
  let attempt = 0;

  while (input.usedTitles.has(candidate.toLowerCase())) {
    attempt += 1;
    candidate = buildClipTitle({
      game: input.game,
      clipIndex: input.clipIndex + attempt,
      customPrefix: "auto mix",
      seedHint: `${input.sourceTitle ?? "source"}:${input.clipIndex}:${attempt}`,
      sourceTitle: input.sourceTitle,
    }).slice(0, 95);
  }

  input.usedTitles.add(candidate.toLowerCase());

  return candidate;
}


function makeStoryTitleUnique(input: {
  title: string;
  sourceTitle?: string | null;
  storyStyle?: string | null;
  musicMood?: string | null;
  clipIndex: number;
  usedTitles: Set<string>;
}) {
  return makeUniqueRobloxStoryTitle({
    title: input.title,
    sourceTitle: input.sourceTitle,
    storyStyle: input.storyStyle,
    musicMood: input.musicMood,
    clipIndex: input.clipIndex,
    seed: `${input.sourceTitle ?? "source"}:${input.storyStyle ?? "auto"}:${input.musicMood ?? "mood"}:${input.clipIndex}`,
    usedTitles: input.usedTitles,
  });
}


function isMovieMomentsJob(job: { titlePrefix?: string | null }) {
  return isMovieMomentsTitlePrefix(job.titlePrefix);
}

function getMovieMomentsTitle(job: { titlePrefix?: string | null; longVideoTitle?: string | null; sourceOriginalName?: string | null }) {
  return (
    decodeMovieMomentsTitlePrefix(job.titlePrefix) ??
    job.longVideoTitle ??
    job.sourceOriginalName ??
    "Movie"
  );
}

async function selectFactoryThumbnail(input: {
  game: string;
  seed: string;
}) {
  const game = input.game as FactoryGame;

  const thumbnails = await db(() =>
    prisma.factoryThumbnail.findMany({
      where: {
        isActive: true,
        OR: [
          {
            game,
          },
          {
            game: "OTHER",
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
  );

  if (thumbnails.length === 0) {
    return null;
  }

  const exactGame = thumbnails.filter((thumbnail) => thumbnail.game === game);
  const pool = exactGame.length > 0 ? exactGame : thumbnails;
  const hash = hashString(input.seed);

  return pool[(hash >>> 0) % pool.length];
}

async function ensureLocalThumbnailFile(input: {
  game: string;
  seed: string;
}) {
  const thumbnail = await selectFactoryThumbnail(input);

  if (!thumbnail) {
    return null;
  }

  if (thumbnail.filePath && fs.existsSync(thumbnail.filePath)) {
    return thumbnail.filePath;
  }

  if (!isR2Enabled() || !thumbnail.storageKey) {
    console.warn(
      `Thumbnail "${thumbnail.title}" not found locally and R2 is not available`,
    );
    return null;
  }

  await mkdir(FACTORY_THUMBNAILS_DIR, { recursive: true });

  const ext = path.extname(thumbnail.originalName ?? thumbnail.filePath) || ".jpg";
  const localPath = path.join(FACTORY_THUMBNAILS_DIR, `${thumbnail.id}${ext}`);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  try {
    await downloadR2ObjectToFile({
      key: thumbnail.storageKey,
      filePath: localPath,
      purpose: `thumbnail ${thumbnail.title}`,
    });
  } catch (error) {
    if (isMissingR2ObjectError(error)) {
      console.warn(
        `Thumbnail "${thumbnail.title}" is missing in R2. Continuing without thumbnail.`,
        {
          thumbnailId: thumbnail.id,
          storageKey: thumbnail.storageKey,
        },
      );

      await safeDb(() =>
        prisma.factoryThumbnail.update({
          where: {
            id: thumbnail.id,
          },
          data: {
            isActive: false,
          },
        }),
      );

      return null;
    }

    throw error;
  }

  return localPath;
}


function musicFallbackMoods(mood: string) {
  const normalized = mood.trim().toLowerCase();
  const fallbackMap: Record<string, string[]> = {
    chase: ["chase", "intense", "suspense", "dramatic"],
    intense: ["intense", "chase", "dramatic", "suspense"],
    scary: ["scary", "horror", "sneaky", "dark", "suspense", "dramatic"],
    horror: ["horror", "scary", "sneaky", "suspense", "dramatic"],
    sneaky: ["sneaky", "suspense", "horror", "dramatic"],
    finale: ["finale", "epic", "victory", "celebration", "dramatic"],
    victory: ["victory", "finale", "celebration", "happy", "epic"],
    hype: ["hype", "intense", "epic", "chaos", "happy"],
    funny: ["funny", "dumb", "happy", "chaos"],
    fail: ["fail", "funny", "dumb", "chaos"],
    gift: ["gift", "happy", "magical", "surprise", "cute"],
    surprise: ["surprise", "gift", "magical", "hype", "dramatic"],
    love: ["love", "romantic", "sad", "emotional", "calm"],
    bullying: ["bullying", "sad", "dramatic", "emotional"],
    revenge: ["revenge", "dramatic", "intense", "epic"],
    system: ["system", "dramatic", "suspense", "intense"],
    sad: ["sad", "emotional", "dramatic", "chill"],
    emotional: ["emotional", "sad", "dramatic", "chill"],
    cute: ["cute", "happy", "chill", "magical"],
    chill: ["chill", "cute", "happy", "explaining"],
    explaining: ["explaining", "chill", "other"],
    riser: ["riser", "suspense", "intense", "dramatic"],
    random: ["random", "other", "dramatic", "suspense"],
    other: ["other", "random", "dramatic", "suspense"],
  };

  return Array.from(new Set([normalized, ...(fallbackMap[normalized] ?? []), "dramatic", "suspense"]));
}

function allowedMusicCopyrightStatuses() {
  const allowUnknown = process.env.FACTORY_ALLOW_UNKNOWN_MUSIC === "true";
  const safeStatuses = ["SAFE_YOUTUBE_AUDIO_LIBRARY", "SAFE_OWNED", "SAFE_ROYALTY_FREE"];

  return allowUnknown ? [...safeStatuses, "UNKNOWN"] : safeStatuses;
}

async function selectFactoryMusicTrack(input: { mood: string; seed: string }) {
  const moods = musicFallbackMoods(input.mood);
  const allowedStatuses = allowedMusicCopyrightStatuses();

  const tracks = await db(() =>
    prisma.factoryMusicTrack.findMany({
      where: {
        isActive: true,
        mood: { in: moods },
        copyrightStatus: { in: allowedStatuses },
      },
      orderBy: { createdAt: "desc" },
    }),
  );

  if (tracks.length === 0) {
    console.warn("No copyright-safe music tracks found for Story Shorts", {
      mood: input.mood,
      fallbackMoods: moods,
      allowedStatuses,
      allowUnknown: process.env.FACTORY_ALLOW_UNKNOWN_MUSIC === "true",
    });
    return null;
  }

  for (const mood of moods) {
    const exact = tracks.filter((track) => track.mood === mood);
    if (exact.length > 0) {
      const hash = hashString(`${mood}:${input.seed}`);
      return exact[(hash >>> 0) % exact.length];
    }
  }

  const hash = hashString(`${input.mood}:${input.seed}`);
  return tracks[(hash >>> 0) % tracks.length];
}

async function ensureLocalMusicFile(input: { mood: string; seed: string }) {
  const track = await selectFactoryMusicTrack(input);

  if (!track) return null;

  if (track.filePath && fs.existsSync(track.filePath)) {
    return track.filePath;
  }

  if (!isR2Enabled() || !track.storageKey) {
    console.warn(`Music track "${track.title}" not found locally and R2 is not available`);
    return null;
  }

  await mkdir(FACTORY_MUSIC_DIR, { recursive: true });
  const ext = path.extname(track.originalName ?? track.filePath) || ".mp3";
  const localPath = path.join(FACTORY_MUSIC_DIR, `${track.id}${ext}`);

  if (fs.existsSync(localPath)) return localPath;

  try {
    await downloadR2ObjectToFile({
      key: track.storageKey,
      filePath: localPath,
      purpose: `music ${track.mood} / ${track.title}`,
    });
    return localPath;
  } catch (error) {
    if (isMissingR2ObjectError(error)) {
      console.warn(`Music track "${track.title}" is missing in R2. Disabling it.`, {
        trackId: track.id,
        storageKey: track.storageKey,
      });

      await safeDb(() =>
        prisma.factoryMusicTrack.update({
          where: { id: track.id },
          data: { isActive: false },
        }),
      );

      return null;
    }

    throw error;
  }
}

async function ensureLocalJobThumbnailFile(job: {
  id: string;
  longVideoThumbnailPath: string | null;
  longVideoThumbnailStorageKey: string | null;
}) {
  if (job.longVideoThumbnailPath && fs.existsSync(job.longVideoThumbnailPath)) {
    return job.longVideoThumbnailPath;
  }

  if (!job.longVideoThumbnailStorageKey || !isR2Enabled()) {
    return null;
  }

  await mkdir(FACTORY_THUMBNAILS_DIR, { recursive: true });
  const ext = path.extname(job.longVideoThumbnailStorageKey) || ".jpg";
  const localPath = path.join(FACTORY_THUMBNAILS_DIR, `${job.id}-long-thumbnail${ext}`);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  try {
    await downloadR2ObjectToFile({
      key: job.longVideoThumbnailStorageKey,
      filePath: localPath,
      purpose: `long video thumbnail for job ${job.id}`,
    });
    return localPath;
  } catch (error) {
    if (isMissingR2ObjectError(error)) {
      console.warn("Long video thumbnail is missing in R2. Continuing without thumbnail.", {
        jobId: job.id,
        storageKey: job.longVideoThumbnailStorageKey,
      });
      await safeDb(() =>
        prisma.factoryJob.update({
          where: { id: job.id },
          data: { longVideoThumbnailStorageKey: null, longVideoThumbnailPath: null },
        }),
      );
      return null;
    }

    throw error;
  }
}

async function processLongVideoJob(input: {
  job: any;
  sourcePath: string;
}) {
  const { job, sourcePath } = input;
  const target = job.targets[0];

  if (!target) {
    throw new Error("У 16:9 задачи нет аккаунта публикации");
  }

  await updateJobProgress(job.id, 36, "Видео 16:9: готовлю facecam-реакцию");
  const reactionPath = await ensureLocalTemplateAssetFile(target);
  const thumbnailPath = await ensureLocalJobThumbnailFile(job);

  await db(() =>
    prisma.factoryJob.update({
      where: { id: job.id },
      data: { status: "RENDERING", totalClips: 1, progress: 45, progressLabel: "Рендерю 16:9 видео 1920x1080" },
    }),
  );

  const baseTemplate = getTargetTemplate(target);
  const outputPath = await renderLongVideo16x9({
    jobId: job.id,
    sourcePath,
    reactionPath,
    template: baseTemplate,
    isCanceled: () => isJobCanceled(job.id),
  });

  const title = (job.longVideoTitle || job.titlePrefix || job.sourceOriginalName || "Roblox video").slice(0, 100);
  const description = job.longVideoDescription || "";

  const sourceDuration = await getSourceDuration(sourcePath);
  const clip = await db(() =>
    prisma.factoryClip.create({
      data: {
        jobId: job.id,
        index: 1,
        startSec: 0,
        endSec: sourceDuration,
        title,
      },
    }),
  );

  const storageKey = `${getR2Prefix()}/jobs/${job.id}/long-video/output.mp4`;
  const uploadedKey = await uploadFileToR2({
    key: storageKey,
    filePath: outputPath,
    contentType: "video/mp4",
  });

  await db(() =>
    prisma.factoryJob.update({
      where: { id: job.id },
      data: { status: "PUBLISHING", progress: 82, progressLabel: `Загружаю 16:9 видео в ${target.account.name}` },
    }),
  );

  const publish = await db(() =>
    prisma.factoryPublish.create({
      data: {
        clipId: clip.id,
        targetId: target.id,
        accountId: target.accountId,
        platform: target.platform,
        status: "QUEUED",
        renderFilePath: outputPath,
        renderStorageKey: uploadedKey,
        title,
        description,
      },
    }),
  );

  if (target.platform !== "YOUTUBE") {
    throw new Error("Видео 16:9 сейчас поддерживает только YouTube");
  }

  await db(() =>
    prisma.factoryPublish.update({
      where: { id: publish.id },
      data: { status: "UPLOADING", error: null },
    }),
  );

  const result = await uploadYoutubeVideo({
    accountId: target.accountId,
    filePath: outputPath,
    title,
    description,
    thumbnailPath,
  });

  await db(() =>
    prisma.factoryPublish.update({
      where: { id: publish.id },
      data: {
        status: "PUBLISHED",
        platformPostId: result.id,
        platformUrl: result.url,
        publishedAt: new Date(),
        error: null,
      },
    }),
  );

  await db(() =>
    prisma.factoryJob.update({
      where: { id: job.id },
      data: { status: "DONE", progress: 100, progressLabel: "Готово" },
    }),
  );

  await rm(outputPath, { force: true });
}

async function processOneJob() {
  const job = await db(() =>
    prisma.factoryJob.findFirst({
      where: {
        status: "QUEUED",
        OR: [
          {
            scheduledAt: null,
          },
          {
            scheduledAt: {
              lte: new Date(),
            },
          },
        ],
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        targets: {
          include: {
            account: true,
            template: {
              include: {
                asset: true,
              },
            },
          },
        },
      },
    }),
  );

  if (!job) {
    return false;
  }

  console.log(`Processing job ${job.id}`);

  let sourcePath: string | null = null;

  try {
    const targets = job.targets;

    if (targets.length === 0) {
      throw new Error("У задачи нет выбранных аккаунтов публикации");
    }

    if (job.cutMode !== "ROBLOX_STORY_AI") {
      for (const target of targets) {
        if (!target.template) {
          throw new Error(
            `Для аккаунта "${target.account.name}" не выбран шаблон.`,
          );
        }

        if (!target.template.asset) {
          throw new Error(
            `Для шаблона "${target.template.name}" не выбрано видео персонажа.`,
          );
        }
      }
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "DOWNLOADING",
          error: null,
          progress: 1,
          progressLabel: "Подготовка исходника",
        },
      }),
    );

    sourcePath = await ensureLocalSourceFile(job);

    await assertNotCanceled(job.id);

    if (job.renderFormat === "LONG_16_9") {
      const readySourcePath = sourcePath;
      await processLongVideoJob({ job, sourcePath: readySourcePath });

      await rm(readySourcePath, { force: true });

      console.log(`Long video job ${job.id} done`);
      return true;
    }

    const duration = await getSourceDuration(sourcePath);

    const globalMaxClips = Number(process.env.FACTORY_MAX_CLIPS_PER_JOB ?? 40);
    const maxTargetClips = Math.max(
      1,
      ...targets.map((target) => target.maxClips ?? 10),
    );

    const maxClips = Math.min(globalMaxClips, maxTargetClips);
    const clipStartIndex = Math.max(0, job.clipStartIndex ?? 0);
    let clipStarts: number[] = [];
    const aiHookPlanByStart = new Map<number, AiHookCutCandidate>();
    const storyPlanByStart = new Map<number, RobloxStoryCandidate>();

    if (job.cutMode === "SMART_HOOK_AI") {
      await updateJobProgress(
        job.id,
        31,
        "AI Hook Cut: ищу моменты через FFmpeg и отправляю лучшие кадры в OpenAI",
      );

      await safeDb(() =>
        prisma.factoryClipCandidate.deleteMany({
          where: {
            jobId: job.id,
          },
        }),
      );

      const candidates = await buildAiHookCutCandidates({
        sourcePath,
        duration,
        clipSeconds: job.clipSeconds,
        hookPreviewSeconds: job.hookPreviewSeconds ?? 8,
        maxClips,
        stepSeconds: job.smartStepSeconds ?? 10,
        maxCandidates: job.smartCandidates ?? 80,
        minGapSeconds: job.smartMinGapSeconds ?? 30,
        clipStartIndex,
        sourceTitle: job.sourceOriginalName,
        game: job.game,
        isCanceled: () => isJobCanceled(job.id),
        onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
      });

      if (candidates.length > 0) {
        await safeDb(() =>
          prisma.factoryClipCandidate.createMany({
            data: candidates.map((candidate) => ({
              jobId: job.id,
              startSec: candidate.startSec,
              endSec: candidate.endSec,
              durationSec: candidate.durationSec,
              motionScore: candidate.motionScore,
              audioScore: candidate.audioScore,
              firstFrameScore: candidate.firstFrameScore,
              sceneScore: candidate.sceneScore,
              finalScore: candidate.finalScore,
              aiScore: candidate.aiScore,
              hookMomentSec: candidate.hookMomentSec,
              hookPreviewStartSec: candidate.hookPreviewStartSec,
              hookPreviewDurationSec: candidate.hookPreviewDurationSec,
              overlayText: candidate.overlayText,
              aiTitle: candidate.title,
              momentType: candidate.momentType,
              selected: candidate.selected,
              reason: candidate.reason,
            })),
          }),
        );
      }

      const selectedAiCandidates = candidates
        .filter((candidate) => candidate.selected)
        .sort((a, b) => a.startSec - b.startSec);

      for (const candidate of selectedAiCandidates) {
        aiHookPlanByStart.set(candidate.startSec, candidate);
      }

      clipStarts = selectedAiCandidates.map((candidate) => candidate.startSec);

      await updateJobProgress(
        job.id,
        55,
        `AI Hook Cut: выбрано сильных моментов ${clipStarts.length}`,
      );

    } else if (job.cutMode === "ROBLOX_STORY_AI") {
      await updateJobProgress(
        job.id,
        31,
        "Roblox Story Shorts: ищу story-моменты и подбираю текст/музыку",
      );

      await safeDb(() =>
        prisma.factoryClipCandidate.deleteMany({
          where: {
            jobId: job.id,
          },
        }),
      );

      const viralBrainSnapshot = job.viralBrainSnapshot as { promptContext?: unknown } | null;
      const candidates = await buildRobloxStoryShortCandidates({
        sourcePath,
        duration,
        maxClips,
        minSeconds: job.storyMinSeconds ?? 10,
        maxSeconds: job.storyMaxSeconds ?? 35,
        storyStyle: job.storyStyle ?? "AUTO",
        sourceTitle: job.sourceOriginalName,
        useEmojis: job.storyUseEmojis ?? true,
        viralBrainPromptContext: viralBrainSnapshot?.promptContext ? String(viralBrainSnapshot.promptContext) : null,
        viralFormula: job.viralFormulaSnapshot,
        stepSeconds: job.smartStepSeconds ?? 6,
        maxCandidates: job.smartCandidates ?? 90,
        minGapSeconds: job.smartMinGapSeconds ?? 24,
        isCanceled: () => isJobCanceled(job.id),
        onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
      });

      if (candidates.length > 0) {
        await safeDb(() =>
          prisma.factoryClipCandidate.createMany({
            data: candidates.map((candidate) => ({
              jobId: job.id,
              startSec: candidate.startSec,
              endSec: candidate.endSec,
              durationSec: candidate.durationSec,
              motionScore: candidate.motionScore,
              audioScore: candidate.audioScore,
              firstFrameScore: 0,
              sceneScore: candidate.sceneScore,
              finalScore: candidate.finalScore,
              aiScore: candidate.aiScore,
              hookMomentSec: candidate.hookMomentSec,
              hookPreviewStartSec: candidate.startSec,
              hookPreviewDurationSec: candidate.durationSec,
              overlayText: [
                candidate.overlayText,
                candidate.conflictText,
                candidate.escalationText,
                candidate.punchlineText,
              ]
                .filter(Boolean)
                .join("\n---\n"),
              aiTitle: candidate.title,
              momentType: `${candidate.storyStyle}:${candidate.musicMood}`,
              selected: candidate.selected,
              reason: [
                candidate.reason,
                job.viralFormulaId ? `viralFormula ${job.viralFormulaId}` : "viralFormula none",
              ].join(" · "),
            })),
          }),
        );
      }

      const selectedStoryCandidates = candidates
        .filter((candidate) => candidate.selected)
        .sort((a, b) => a.startSec - b.startSec);

      for (const candidate of selectedStoryCandidates) {
        storyPlanByStart.set(candidate.startSec, candidate);
      }

      clipStarts = selectedStoryCandidates.map((candidate) => candidate.startSec);

      await updateJobProgress(
        job.id,
        55,
        `Roblox Story Shorts: выбрано сюжетных моментов ${clipStarts.length}`,
      );
    } else if (job.cutMode === "SMART_LITE") {
      await updateJobProgress(
        job.id,
        31,
        "Smart Cut Lite: анализирую движение, звук и стартовые кадры",
      );

      await safeDb(() =>
        prisma.factoryClipCandidate.deleteMany({
          where: {
            jobId: job.id,
          },
        }),
      );

      const candidates = await buildSmartClipCandidates({
        sourcePath,
        duration,
        clipSeconds: job.clipSeconds,
        maxClips,
        stepSeconds: job.smartStepSeconds ?? 10,
        maxCandidates: job.smartCandidates ?? 80,
        minGapSeconds: job.smartMinGapSeconds ?? 30,
        clipStartIndex,
        isCanceled: () => isJobCanceled(job.id),
        onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
      });

      if (candidates.length > 0) {
        await safeDb(() =>
          prisma.factoryClipCandidate.createMany({
            data: candidates.map((candidate) => ({
              jobId: job.id,
              startSec: candidate.startSec,
              endSec: candidate.endSec,
              durationSec: candidate.durationSec,
              motionScore: candidate.motionScore,
              audioScore: candidate.audioScore,
              firstFrameScore: candidate.firstFrameScore,
              sceneScore: candidate.sceneScore,
              finalScore: candidate.finalScore,
              selected: candidate.selected,
              reason: candidate.reason,
            })),
          }),
        );
      }

      clipStarts = candidates
        .filter((candidate) => candidate.selected)
        .sort((a, b) => a.startSec - b.startSec)
        .map((candidate) => candidate.startSec);

      await updateJobProgress(
        job.id,
        55,
        `Smart Cut Lite: выбрано лучших клипов ${clipStarts.length}`,
      );
    } else {
      clipStarts = buildSequentialClipStarts({
        duration,
        clipSeconds: job.clipSeconds,
        maxClips,
        clipStartIndex,
      });
    }

    if (clipStarts.length === 0) {
      throw new Error(
        "Видео слишком короткое или умная нарезка не нашла подходящие моменты",
      );
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "RENDERING",
          totalClips: clipStarts.length,
          progress: 30,
          progressLabel: `Найдено клипов: ${clipStarts.length}`,
        },
      }),
    );

    const totalRenders = clipStarts.reduce((sum, _startSec, index) => {
      const clipNumber = index + 1;

      return (
        sum +
        targets.filter((target) => clipNumber <= (target.maxClips ?? 10)).length
      );
    }, 0);

    let completedRenders = 0;
    const usedPackageTitles = new Set<string>();
    const usedPublishTitles = new Set<string>();

    for (let i = 0; i < clipStarts.length; i += 1) {
      await assertNotCanceled(job.id);

      const localClipNumber = i + 1;
      const clipIndex = clipStartIndex + localClipNumber;
      const startSec = clipStarts[i];
      const storyPlan = storyPlanByStart.get(startSec);
      const effectiveClipSeconds = storyPlan?.durationSec ?? job.clipSeconds;
      const endSec = startSec + effectiveClipSeconds;

      const aiHookPlan = aiHookPlanByStart.get(startSec);
      const movieMomentsJob = isMovieMomentsJob(job);
      const rawBaseTitle = storyPlan?.title ?? aiHookPlan?.title ?? (movieMomentsJob
        ? null
        : buildClipTitle({
            game: job.game,
            clipIndex,
            customPrefix: job.titlePrefix,
            seedHint: `${job.id}:${clipIndex}:base`,
            sourceTitle: job.sourceOriginalName,
          }));
      const baseTitle = storyPlan
        ? makeStoryTitleUnique({
            title: rawBaseTitle ?? "",
            sourceTitle: job.sourceOriginalName,
            storyStyle: storyPlan.storyStyle,
            musicMood: storyPlan.musicMood,
            clipIndex,
            usedTitles: usedPackageTitles,
          })
        : movieMomentsJob
          ? generateUniqueMovieMomentTitle({
              title: rawBaseTitle,
              movieTitle: getMovieMomentsTitle(job),
              clipIndex,
              seed: `${job.id}:${clipIndex}:package`,
              usedTitles: usedPackageTitles,
            })
          : job.game === "ROBLOX"
            ? sanitizeFinalRobloxStoryTitle({
                title: rawBaseTitle ?? "",
                sourceTitle: job.sourceOriginalName,
                storyStyle: "auto",
                musicMood: "AUTO",
                clipIndex,
                seed: `${job.id}:${clipIndex}:package`,
                usedTitles: usedPackageTitles,
              })
            : makeJobTitleUnique({
                title: rawBaseTitle ?? "",
                game: job.game,
                sourceTitle: job.sourceOriginalName,
                clipIndex,
                usedTitles: usedPackageTitles,
              });

      if (storyPlan) {
        console.log("[story-shorts] title generated", {
          jobId: job.id,
          clipIndex,
          title: baseTitle,
          storyType: storyPlan.storyStyle,
          musicMood: storyPlan.musicMood,
        });
      }

      const clip = await db(() =>
        prisma.factoryClip.create({
          data: {
            jobId: job.id,
            index: clipIndex,
            startSec,
            endSec,
            title: baseTitle,
          },
        }),
      );

      for (const target of targets) {
        await assertNotCanceled(job.id);

        if (localClipNumber > (target.maxClips ?? 10)) {
          continue;
        }

        const titlePrefixForTarget = target.titlePrefix || job.titlePrefix;

        const title = storyPlan
          ? sanitizeFinalRobloxStoryTitle({
              title: baseTitle,
              sourceTitle: job.sourceOriginalName,
              storyStyle: storyPlan.storyStyle,
              musicMood: storyPlan.musicMood,
              clipIndex,
              seed: `${job.id}:${target.accountId}:${clipIndex}:publish`,
              usedTitles: usedPublishTitles,
            })
          : movieMomentsJob
            ? generateUniqueMovieMomentTitle({
                title: baseTitle,
                movieTitle: getMovieMomentsTitle(job),
                clipIndex: clipIndex + 1000,
                seed: `${job.id}:${target.accountId}:${clipIndex}:publish`,
                usedTitles: usedPublishTitles,
              })
            : job.game === "ROBLOX"
              ? sanitizeFinalRobloxStoryTitle({
                  title: baseTitle,
                  sourceTitle: job.sourceOriginalName,
                  storyStyle: "auto",
                  musicMood: "AUTO",
                  clipIndex: clipIndex + 1000,
                  seed: `${job.id}:${target.accountId}:${clipIndex}:publish`,
                  usedTitles: usedPublishTitles,
                })
              : makeJobTitleUnique({
                  title: baseTitle,
                  game: job.game,
                  sourceTitle: job.sourceOriginalName,
                  clipIndex: clipIndex + 1000,
                  usedTitles: usedPublishTitles,
                });

        if (storyPlan || job.game === "ROBLOX" || movieMomentsJob) {
          console.log("[youtube-upload] final title before upload", {
            jobId: job.id,
            clipIndex,
            targetId: target.id,
            title,
          });
        }

        const description = movieMomentsJob
          ? (job.longVideoDescription || "")
          : buildClipDescription({
              game: job.game,
              title,
              customPrefix: titlePrefixForTarget,
              sourceTitle: job.sourceOriginalName,
            });

        const renderProgress =
          30 + Math.round((completedRenders / Math.max(1, totalRenders)) * 45);

        await updateJobProgress(
          job.id,
          renderProgress,
          `Рендер ${localClipNumber}/${clipStarts.length} для ${target.account.name}`,
        );

        let outputPath: string;

        if (storyPlan) {
          const selectedMood =
            job.storyMusicMood && job.storyMusicMood !== "AUTO"
              ? job.storyMusicMood
              : storyPlan.musicMood;
          const musicPath = await ensureLocalMusicFile({
            mood: selectedMood,
            seed: `${job.id}:${clipIndex}:${storyPlan.musicMood}`,
          });

          console.log("[story-shorts] overlay generated", {
            jobId: job.id,
            clipIndex,
            overlayText: storyPlan.overlayText,
            conflictText: storyPlan.conflictText,
            escalationText: storyPlan.escalationText,
            punchlineText: storyPlan.punchlineText,
            storyType: storyPlan.storyStyle,
          });

          outputPath = await renderRobloxStoryShort({
            jobId: job.id,
            clipIndex,
            sourcePath,
            startSec: storyPlan.startSec,
            clipSeconds: storyPlan.durationSec,
            overlayText: storyPlan.overlayText,
            conflictText: storyPlan.conflictText,
            escalationText: storyPlan.escalationText,
            punchlineText: storyPlan.punchlineText,
            secondaryText: storyPlan.secondaryText,
            musicPath,
            sourceAudioVolumePercent: job.storySourceVolume ?? 10,
            musicStartSec: Math.max(0, Math.round(storyPlan.hookMomentSec - storyPlan.startSec - Math.max(6, storyPlan.durationSec * 0.55))),
            isCanceled: () => isJobCanceled(job.id),
          });
        } else {
          const characterVideoPath = await ensureLocalTemplateAssetFile(target);

          const thumbnailPath = movieMomentsJob
            ? null
            : await ensureLocalThumbnailFile({
                game: job.game,
                seed: `${job.id}:${target.accountId}:${clipIndex}`,
              });

          outputPath = await renderFactoryClip({
            jobId: job.id,
            clipIndex,
            sourcePath,
            lanaPath: characterVideoPath,
            startSec,
            clipSeconds: effectiveClipSeconds,
            template: getTargetTemplate(target),
            thumbnailPath: aiHookPlan ? null : thumbnailPath,
            hookPreview: aiHookPlan
              ? {
                  startSec: aiHookPlan.hookPreviewStartSec,
                  durationSec: aiHookPlan.hookPreviewDurationSec,
                  overlayText: aiHookPlan.overlayText,
                }
              : null,
            isCanceled: () => isJobCanceled(job.id),
          });
        }

        try {
          await assertNotCanceled(job.id);

          const storageKey = `${getR2Prefix()}/jobs/${job.id}/targets/${
            target.accountId
          }/clips/${String(clipIndex).padStart(4, "0")}.mp4`;

          const uploadedKey = await uploadFileToR2({
            key: storageKey,
            filePath: outputPath,
            contentType: "video/mp4",
          });

          await db(() =>
            prisma.factoryJob.update({
              where: {
                id: job.id,
              },
              data: {
                status: "PUBLISHING",
                progress:
                  75 +
                  Math.round(
                    (completedRenders / Math.max(1, totalRenders)) * 20,
                  ),
                progressLabel: `Публикация ${localClipNumber}/${clipStarts.length} в ${target.account.name}`,
              },
            }),
          );

          const publish = await db(() =>
            prisma.factoryPublish.create({
              data: {
                clipId: clip.id,
                targetId: target.id,
                accountId: target.accountId,
                platform: target.platform,
                status: "QUEUED",
                renderFilePath: outputPath,
                renderStorageKey: uploadedKey,
                title,
                description,
              },
            }),
          );

          if (target.platform === "YOUTUBE") {
            await db(() =>
              prisma.factoryPublish.update({
                where: {
                  id: publish.id,
                },
                data: {
                  status: "UPLOADING",
                  error: null,
                },
              }),
            );

            try {
              const result = await uploadYoutubeShort({
                accountId: target.accountId,
                filePath: outputPath,
                title,
                description,
                categoryId: movieMomentsJob ? "1" : undefined,
              });

              await db(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "PUBLISHED",
                    platformPostId: result.id,
                    platformUrl: result.url,
                    error: null,
                  },
                }),
              );
            } catch (error) {
              await safeDb(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "FAILED",
                    error:
                      error instanceof Error
                        ? error.message
                        : "YouTube upload failed",
                  },
                }),
              );
            }
          }

          if (target.platform === "TIKTOK") {
            await db(() =>
              prisma.factoryPublish.update({
                where: {
                  id: publish.id,
                },
                data: {
                  status: "UPLOADING",
                  error: null,
                },
              }),
            );

            try {
              const result = await uploadTikTokDraft({
                accountId: target.accountId,
                filePath: outputPath,
                title,
                description,
              });

              await db(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "PUBLISHED",
                    platformPostId: result.id,
                    platformUrl: result.url,
                    error: result.message,
                  },
                }),
              );
            } catch (error) {
              await safeDb(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "FAILED",
                    error:
                      error instanceof Error
                        ? error.message
                        : "TikTok draft upload failed",
                  },
                }),
              );
            }
          }

          completedRenders += 1;
        } finally {
          await rm(outputPath, {
            force: true,
          });
        }
      }
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "DONE",
          progress: 100,
          progressLabel: "Готово",
        },
      }),
    );

    if (sourcePath) {
      await rm(sourcePath, {
        force: true,
      });
    }

    console.log(`Job ${job.id} done`);
    return true;
  } catch (error) {
    console.error(error);

    const isCanceledError =
      error instanceof Error && error.message.toLowerCase().includes("отмен");

    if (isCanceledError) {
      await markJobCanceled(job.id);
    } else {
      await markJobFailed(job.id, error);
    }

    if (sourcePath) {
      await rm(sourcePath, {
        force: true,
      });
    }

    return true;
  }
}

async function resetInterruptedJobs() {
  await db(() =>
    prisma.factoryJob.updateMany({
      where: {
        status: {
          in: ["DOWNLOADING", "RENDERING", "PUBLISHING"],
        },
      },
      data: {
        status: "QUEUED",
        progressLabel: "Задача восстановлена после перезапуска worker",
      },
    }),
  );
}

async function main() {
  console.log("Factory worker started");

  await mkdir(FACTORY_SOURCE_DIR, {
    recursive: true,
  });

  await resetInterruptedJobs();

  while (true) {
    const processed = await processOneJob();

    if (!processed) {
      await sleep(5000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
