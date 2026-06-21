import path from "node:path";
import { rm } from "node:fs/promises";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { prisma } from "@/lib/prisma";
import { downloadVkVideoToFile } from "@/lib/factory/vk-download-provider";
import { buildVkRuTitlePrefix, normalizeMovieTitleFromSource } from "@/lib/factory/movie-title-normalizer";
import { assertVideoHasAudio, hasAudioStream } from "@/lib/factory/video";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

type DownloadVkVideoInput = {
  jobId: string;
  sourceUrl: string;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
};

export function isVkVideoUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "vk.com" || host === "m.vk.com" || host === "vkvideo.ru" || host.endsWith(".vk.com");
  } catch {
    return false;
  }
}

async function assertNotCanceled(isCanceled?: CancelCheck) {
  if (await isCanceled?.()) throw new Error("Задача отменена пользователем");
}

async function updateJobMovieTitleFromDownload(input: {
  jobId: string;
  downloadedTitle?: string | null;
}) {
  const normalized = normalizeMovieTitleFromSource(input.downloadedTitle);
  if (!normalized.movieTitle) return null;

  const titlePrefix = buildVkRuTitlePrefix(normalized.movieTitle);

  await prisma.$transaction([
    prisma.factoryJob.update({
      where: { id: input.jobId },
      data: {
        sourceOriginalName: normalized.movieTitle,
        titlePrefix,
        longVideoDescription: input.downloadedTitle?.trim().slice(0, 500) || undefined,
      },
    }),
    prisma.factoryJobTarget.updateMany({
      where: { jobId: input.jobId },
      data: { titlePrefix },
    }),
  ]);

  console.log("[VK_DOWNLOADER] movie title resolved", {
    jobId: input.jobId,
    movieTitle: normalized.movieTitle,
    movieYear: normalized.movieYear,
  });

  return normalized.movieTitle;
}

export async function downloadViaVkVideo(input: DownloadVkVideoInput) {
  await ensureFactoryDirs();
  await assertNotCanceled(input.isCanceled);
  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);
  const preferredQuality = process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.toLowerCase() === "best" ? "best" : "720p";

  try {
    const result = await downloadVkVideoToFile({
      videoUrl: input.sourceUrl,
      outputPath,
      preferredQuality,
      onProgress: input.onProgress,
    });
    await assertNotCanceled(input.isCanceled);
    const resolvedMovieTitle = await updateJobMovieTitleFromDownload({
      jobId: input.jobId,
      downloadedTitle: result.resolved.title,
    });
    await input.onProgress?.(
      23,
      resolvedMovieTitle
        ? `Название фильма определено: ${resolvedMovieTitle}`
        : "Название фильма не найдено в VK, использую исходные настройки",
    );
    await input.onProgress?.(24, `MP4 ${result.resolved.quality || "лучшего качества"} скачан, проверяю звук`);
    if (!(await hasAudioStream(outputPath))) {
      await rm(outputPath, { force: true });
      throw new Error("vkvideodownload.com вернул MP4 без звука");
    }
    await assertVideoHasAudio(outputPath);
    await input.onProgress?.(30, `VK MP4 ${result.resolved.quality || ""} со звуком скачан через vkvideodownload.com`.replace(/\s+/g, " "));
    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  }
}
