import { createWriteStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  rankVkVideoDownloadCandidates,
  resolveVkVideoDownloadCandidates,
  resolveWithVkVideoDownload,
  type VkVideoDownloadCandidate,
  type VkVideoDownloadResolved,
} from "@/lib/factory/providers/vkvideodownload-provider";
import {
  getVideoDurationSeconds,
  hasAudioStream,
  hasVideoStream,
  runCommand,
} from "@/lib/factory/video";
import { getVkCookiesFileForYtDlp } from "@/lib/factory/vk-cookies";

export type VkResolvedVideo = VkVideoDownloadResolved;
export type VkDownloadProvider = "vkvideodownload" | "yt-dlp" | "auto";

type ProgressCallback = (progress: number, label: string) => Promise<void> | void;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0 Safari/537.36";

export function getVkDownloadProviderConfig() {
  const configured = (process.env.VK_DOWNLOAD_PROVIDER || "vkvideodownload").toLowerCase();
  const provider: VkDownloadProvider = configured === "yt-dlp" || configured === "auto" ? configured : "vkvideodownload";
  return {
    provider,
    allowYtDlpFallback: process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true",
    allowQualityFallback: process.env.VK_DOWNLOAD_ALLOW_QUALITY_FALLBACK?.toLowerCase() !== "false",
    requireAudio: process.env.VK_DOWNLOAD_REQUIRE_AUDIO?.toLowerCase() !== "false",
    preferredQuality: process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.toLowerCase() === "best" ? "best" as const : "720p" as const,
    resolverDelayMs: Math.max(3000, Number(process.env.VK_DOWNLOAD_RESOLVER_DELAY_MS || 4000)),
    timeoutMs: Math.max(60_000, Number(process.env.VK_DOWNLOAD_TIMEOUT_MS || 30 * 60 * 1000)),
  };
}

async function resolveWithYtDlp(videoUrl: string): Promise<VkResolvedVideo> {
  let output = "";
  const cookiesFile = await getVkCookiesFileForYtDlp();
  const args = [
    "--no-playlist",
    "--no-warnings",
    "-g",
    "-f",
    "b[height=720][ext=mp4]/b[height<=720][ext=mp4]/best[ext=mp4]/best",
  ];
  if (cookiesFile) args.push("--cookies", cookiesFile);
  args.push(videoUrl);
  await runCommand(
    "yt-dlp",
    args,
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

function buildDownloadHeaders(input: {
  directUrl: string;
  sourceUrl: string;
  candidateHeaders?: Record<string, string>;
  variant: "vkvideodownload" | "vk-source";
}) {
  if (input.variant === "vk-source") {
    const sourceHost = new URL(input.sourceUrl).origin;
    return {
      "user-agent": USER_AGENT,
      accept: "video/mp4,video/*,*/*",
      referer: input.sourceUrl,
      origin: sourceHost,
      ...(input.candidateHeaders?.cookie ? { cookie: input.candidateHeaders.cookie } : {}),
    };
  }

  return {
    "user-agent": USER_AGENT,
    accept: "video/mp4,video/*,*/*",
    referer: "https://vkvideodownload.com/",
    ...(input.candidateHeaders || {}),
  };
}

async function downloadDirectUrl(input: {
  directUrl: string;
  outputPath: string;
  sourceUrl: string;
  candidateHeaders?: Record<string, string>;
  timeoutMs: number;
}) {
  const headerVariants: Array<"vkvideodownload" | "vk-source"> = ["vkvideodownload", "vk-source"];
  let lastError: unknown;

  for (const variant of headerVariants) {
    const headers = buildDownloadHeaders({
      directUrl: input.directUrl,
      sourceUrl: input.sourceUrl,
      candidateHeaders: input.candidateHeaders,
      variant,
    });

    try {
      const response = await fetch(input.directUrl, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(input.timeoutMs),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (contentType.includes("text/html")) {
        throw new Error("downloader вернул HTML вместо видео");
      }

      await rm(input.outputPath, { force: true });
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(input.outputPath));
      return;
    } catch (error) {
      lastError = error;
      await rm(input.outputPath, { force: true });
    }
  }

  throw new Error(`Не удалось скачать MP4: ${lastError instanceof Error ? lastError.message : "ошибка потока"}`);
}

async function probeDownloadedFile(input: {
  outputPath: string;
  requireAudio: boolean;
}) {
  const fileStat = await stat(input.outputPath);
  if (fileStat.size < 1024 * 1024) throw new Error(`файл слишком маленький: ${fileStat.size} bytes`);

  const hasVideo = await hasVideoStream(input.outputPath);
  if (!hasVideo) throw new Error("в скачанном MP4 нет видеодорожки");

  const hasAudio = await hasAudioStream(input.outputPath);
  if (input.requireAudio && !hasAudio) throw new Error("в скачанном MP4 нет звука");

  const durationSeconds = await getVideoDurationSeconds(input.outputPath);
  if (durationSeconds < 10) throw new Error(`слишком короткое видео: ${durationSeconds} sec`);

  return {
    sizeBytes: fileStat.size,
    hasAudio,
    hasVideo,
    durationSeconds,
  };
}

function filterPreferredOnly(candidates: VkVideoDownloadCandidate[], preferredQuality: "720p" | "best") {
  if (preferredQuality === "best") return candidates;
  const preferredHeight = Number(process.env.VK_DOWNLOAD_PREFERRED_QUALITY?.match(/(\d{3,4})/)?.[1] || 720);
  const exact = candidates.filter((candidate) => candidate.quality === preferredHeight);
  return exact.length ? exact : candidates;
}

export async function downloadVkVideoToFile(input: {
  videoUrl: string;
  outputPath: string;
  preferredQuality?: "720p" | "best";
  onProgress?: ProgressCallback;
}) {
  const config = getVkDownloadProviderConfig();
  const preferredQuality = input.preferredQuality || config.preferredQuality;

  if (config.provider === "yt-dlp") {
    const resolved = await resolveWithYtDlp(input.videoUrl);
    await input.onProgress?.(7, "Скачиваю MP4 через yt-dlp");
    await downloadDirectUrl({
      directUrl: resolved.directUrl,
      outputPath: input.outputPath,
      sourceUrl: input.videoUrl,
      timeoutMs: config.timeoutMs,
    });
    const probe = await probeDownloadedFile({ outputPath: input.outputPath, requireAudio: config.requireAudio });
    return { filePath: input.outputPath, resolved, probe };
  }

  await input.onProgress?.(3, "Получаю MP4-ссылки через vkvideodownload");
  const resolvedCandidates = await resolveVkVideoDownloadCandidates({ sourceUrl: input.videoUrl });
  let rankedCandidates = rankVkVideoDownloadCandidates(resolvedCandidates.candidates, preferredQuality);

  if (!config.allowQualityFallback) {
    rankedCandidates = filterPreferredOnly(rankedCandidates, preferredQuality);
  }

  await input.onProgress?.(5, `Найдено MP4 вариантов: ${rankedCandidates.length}`);

  if (!rankedCandidates.length) {
    const errors = resolvedCandidates.debug.errors.length ? `: ${resolvedCandidates.debug.errors.join("; ")}` : "";
    throw new Error(`vkvideodownload не вернул MP4-кандидаты${errors}`);
  }

  const errors: string[] = [];

  for (const candidate of rankedCandidates) {
    const qualityLabel = candidate.quality ? `${candidate.quality}p` : (candidate.label || "MP4");
    await input.onProgress?.(7, `Скачиваю ${qualityLabel} MP4`);
    console.log("[VKVD] downloading candidate", {
      quality: candidate.quality,
      label: candidate.label,
      source: candidate.source,
      sizeText: candidate.sizeText,
      urlPreview: candidate.url.slice(0, 120),
    });

    try {
      await downloadDirectUrl({
        directUrl: candidate.url,
        outputPath: input.outputPath,
        sourceUrl: input.videoUrl,
        candidateHeaders: candidate.headers,
        timeoutMs: config.timeoutMs,
      });
      await input.onProgress?.(15, "Видео скачано, проверяю звук");
      const probe = await probeDownloadedFile({ outputPath: input.outputPath, requireAudio: config.requireAudio });
      const resolved = {
        sourceUrl: input.videoUrl,
        directUrl: candidate.url,
        quality: qualityLabel,
        format: candidate.ext || "mp4",
        title: resolvedCandidates.title,
        durationSec: resolvedCandidates.durationSec || probe.durationSeconds,
        hasAudio: probe.hasAudio,
        candidate,
      } satisfies VkVideoDownloadResolved;

      console.log("[VKVD] downloaded", {
        quality: resolved.quality,
        sizeBytes: probe.sizeBytes,
        durationSeconds: probe.durationSeconds,
        hasVideo: probe.hasVideo,
        hasAudio: probe.hasAudio,
      });

      return { filePath: input.outputPath, resolved, probe };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "неизвестная ошибка";
      errors.push(`${qualityLabel}: ${reason}`);
      await rm(input.outputPath, { force: true });
      await input.onProgress?.(8, `${qualityLabel} не скачался, пробую следующий MP4`);
      console.warn("[VKVD] candidate failed", { quality: candidate.quality, label: candidate.label, source: candidate.source, error: reason });
    }
  }

  if (config.allowYtDlpFallback || config.provider === "auto") {
    console.error("[VKVD] all candidates failed, trying optional yt-dlp fallback", { errors });
    const resolved = await resolveWithYtDlp(input.videoUrl);
    await input.onProgress?.(9, "Пробую yt-dlp fallback");
    await downloadDirectUrl({
      directUrl: resolved.directUrl,
      outputPath: input.outputPath,
      sourceUrl: input.videoUrl,
      timeoutMs: config.timeoutMs,
    });
    const probe = await probeDownloadedFile({ outputPath: input.outputPath, requireAudio: config.requireAudio });
    return { filePath: input.outputPath, resolved, probe };
  }

  throw new Error(`Все MP4-кандидаты vkvideodownload не прошли проверку: ${errors.join("; ")}`);
}
