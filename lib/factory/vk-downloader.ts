import path from "node:path";
import { rm } from "node:fs/promises";

import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { downloadVkVideoToFile } from "@/lib/factory/vk-download-provider";
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

export async function downloadViaVkVideo(input: DownloadVkVideoInput) {
  await ensureFactoryDirs();
  await assertNotCanceled(input.isCanceled);
  const outputPath = path.join(FACTORY_SOURCE_DIR, `${input.jobId}.mp4`);
  const preferredQuality = process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.toLowerCase() === "best" ? "best" : "720p";

  await input.onProgress?.(3, "Получаю прямую MP4-ссылку через vkvideodownload.com");
  try {
    const result = await downloadVkVideoToFile({
      videoUrl: input.sourceUrl,
      outputPath,
      preferredQuality,
    });
    await assertNotCanceled(input.isCanceled);
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
