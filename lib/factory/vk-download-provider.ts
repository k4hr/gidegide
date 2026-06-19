import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  resolveWithVkVideoDownload,
  type VkVideoDownloadResolved,
} from "@/lib/factory/providers/vkvideodownload-provider";
import { runCommand } from "@/lib/factory/video";

export type VkResolvedVideo = VkVideoDownloadResolved;
export type VkDownloadProvider = "vkvideodownload" | "yt-dlp" | "auto";

export function getVkDownloadProviderConfig() {
  const configured = (process.env.VK_DOWNLOAD_PROVIDER || "vkvideodownload").toLowerCase();
  const provider: VkDownloadProvider = configured === "yt-dlp" || configured === "auto" ? configured : "vkvideodownload";
  return {
    provider,
    allowYtDlpFallback: process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true",
    preferredQuality: process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.toLowerCase() === "best" ? "best" as const : "720p" as const,
    resolverDelayMs: Math.max(3000, Number(process.env.VK_DOWNLOAD_RESOLVER_DELAY_MS || 4000)),
  };
}

async function resolveWithYtDlp(videoUrl: string): Promise<VkResolvedVideo> {
  let output = "";
  await runCommand(
    "yt-dlp",
    [
      "--no-playlist",
      "--no-warnings",
      "-g",
      "-f",
      "b[height=720][ext=mp4]/b[height<=720][ext=mp4]/best[ext=mp4]/best",
      videoUrl,
    ],
    { onOutput: (text) => { output += text; } },
  );
  const directUrl = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^https?:\/\//i.test(line));
  if (!directUrl) throw new Error("yt-dlp не вернул прямую MP4-ссылку");
  return { sourceUrl: videoUrl, directUrl, quality: "best<=720p", format: "mp4", hasAudio: true };
}

export async function resolveVkVideoDownloadUrl(input: {
  videoUrl: string;
  preferredQuality?: "720p" | "best";
}): Promise<VkResolvedVideo> {
  const config = getVkDownloadProviderConfig();
  const preferredQuality = input.preferredQuality || config.preferredQuality;
  if (config.provider === "yt-dlp") return resolveWithYtDlp(input.videoUrl);
  try {
    return await resolveWithVkVideoDownload(input.videoUrl, preferredQuality);
  } catch (error) {
    if (config.allowYtDlpFallback || config.provider === "auto") {
      console.error("vkvideodownload.com resolver failed, trying optional yt-dlp fallback:", error);
      return resolveWithYtDlp(input.videoUrl);
    }
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    throw new Error(`${reason}. yt-dlp fallback выключен.`);
  }
}

async function downloadDirectUrl(directUrl: string, outputPath: string) {
  const response = await fetch(directUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0 Safari/537.36",
      accept: "video/mp4,video/*,*/*",
      referer: "https://vk.com/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body) throw new Error("Не удалось скачать MP4");
  if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
    throw new Error("Не удалось скачать MP4: downloader вернул HTML вместо видео");
  }
  await rm(outputPath, { force: true });
  try {
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(outputPath));
  } catch (error) {
    await rm(outputPath, { force: true });
    throw new Error(`Не удалось скачать MP4: ${error instanceof Error ? error.message : "ошибка потока"}`);
  }
}

export async function downloadVkVideoToFile(input: {
  videoUrl: string;
  outputPath: string;
  preferredQuality?: "720p" | "best";
}) {
  const resolved = await resolveVkVideoDownloadUrl(input);
  await downloadDirectUrl(resolved.directUrl, input.outputPath);
  return { filePath: input.outputPath, resolved };
}
