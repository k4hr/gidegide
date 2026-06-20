import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkVkSourceVideos, humanizeVkAutoSourceError } from "@/lib/factory/vk-auto-source";
import { getVkCookiesStatus } from "@/lib/factory/vk-cookies";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "Источник не найден" }, { status: 404 });

  try {
    const vkCookies = await getVkCookiesStatus();
    const result = await checkVkSourceVideos({ sourceUrl: source.sourceUrl, limit: 10 });
    await prisma.factoryVkAutoSource.update({
      where: { id: source.id },
      data: { lastError: result.videos.length ? null : "Список видео не найден на публичной странице" },
    });

    return NextResponse.json({
      ok: result.videos.length > 0,
      foundCount: result.videos.length,
      videos: result.videos.slice(0, 10),
      candidatesTried: result.attempts,
      strategies: result.attempts.map((attempt) => ({ name: attempt.provider, enabled: attempt.error !== "disabled", foundCount: attempt.foundCount || 0, error: attempt.error })),
      vkCookies,
      listing: {
        playwright: process.env.VK_LISTING_ENABLE_PLAYWRIGHT?.toLowerCase() === "true",
        ytDlpFallback: process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true",
      },
      error: result.videos.length ? null : vkCookies.enabled ? "Список видео не найден даже с VK cookies" : "Список видео не найден на публичной странице. Возможно, нужны VK cookies.",
    });
  } catch (error) {
    const reason = humanizeVkAutoSourceError(error);
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastError: reason } });
    const vkCookies = await getVkCookiesStatus();
    return NextResponse.json({ ok: false, foundCount: 0, videos: [], candidatesTried: [], strategies: [], vkCookies, listing: { playwright: process.env.VK_LISTING_ENABLE_PLAYWRIGHT?.toLowerCase() === "true", ytDlpFallback: process.env.VK_DOWNLOAD_ALLOW_YTDLP_FALLBACK?.toLowerCase() === "true" }, error: reason }, { status: 200 });
  }
}
