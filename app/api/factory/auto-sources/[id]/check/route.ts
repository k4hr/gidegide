import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { checkVkSourceVideos, humanizeVkAutoSourceError } from "@/lib/factory/vk-auto-source";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  const { id } = await context.params;
  const source = await prisma.factoryVkAutoSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "Источник не найден" }, { status: 404 });

  try {
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
      error: result.videos.length ? null : "Список видео не найден на публичной странице",
    });
  } catch (error) {
    const reason = humanizeVkAutoSourceError(error);
    await prisma.factoryVkAutoSource.update({ where: { id: source.id }, data: { lastError: reason } });
    return NextResponse.json({ ok: false, foundCount: 0, videos: [], candidatesTried: [], error: reason }, { status: 200 });
  }
}
