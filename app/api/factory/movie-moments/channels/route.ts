import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";
import { withDbRetry } from "../../../../../lib/factory/db-retry";
import {
  addSuperUploadDonor,
  buildTodayCandidates,
  listSuperUploadDonors,
  MOVIE_MOMENTS_DONOR_KIND,
} from "../../../../../lib/factory/super-upload";

export const runtime = "nodejs";

function serializeDonor(donor: {
  id: string;
  channelId: string;
  channelTitle: string;
  sourceUrl: string;
  uploadsPlaylistId: string | null;
  subscriberCount: bigint;
  videoCount: bigint;
  viewCount: bigint;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...donor,
    subscriberCount: donor.subscriberCount.toString(),
    videoCount: donor.videoCount.toString(),
    viewCount: donor.viewCount.toString(),
  };
}

const postSchema = z.object({
  sourceUrl: z.string().min(3, "Вставь ссылку на официальный YouTube-канал, видео или @handle"),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  try {
    const donors = await listSuperUploadDonors({ donorKind: MOVIE_MOMENTS_DONOR_KIND });
    const candidates = await buildTodayCandidates({ limit: 3, donorKind: MOVIE_MOMENTS_DONOR_KIND });

    return NextResponse.json({
      donors: donors.map(serializeDonor),
      candidates,
      summary: {
        donors: donors.length,
        active: donors.filter((donor) => donor.isActive).length,
        candidates: candidates.length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось загрузить movie-каналы" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = postSchema.parse(await request.json());
    const sourceUrl = body.sourceUrl;
    if (!sourceUrl) {
      return NextResponse.json({ error: "Вставь ссылку на официальный YouTube-канал, видео или @handle" }, { status: 400 });
    }
    const result = await addSuperUploadDonor({
      sourceUrl,
      donorKind: MOVIE_MOMENTS_DONOR_KIND,
    });
    const candidates = await buildTodayCandidates({ limit: 3, donorKind: MOVIE_MOMENTS_DONOR_KIND });

    return NextResponse.json({
      donor: serializeDonor(result.donor),
      analysis: result.analysis,
      candidates,
      message: `Канал сохранен: ${result.donor.channelTitle}. Видео найдено: ${result.analysis.totalSeen}.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось добавить movie-канал" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = deleteSchema.parse(await request.json());

    const donor = await withDbRetry(() =>
      prisma.factoryDonorChannel.update({
        where: { id: body.id },
        data: { isActive: false },
      }),
    );
    const candidates = await buildTodayCandidates({ limit: 3, donorKind: MOVIE_MOMENTS_DONOR_KIND });

    return NextResponse.json({
      donor: serializeDonor(donor),
      candidates,
      message: "Канал выключен. Старые найденные фильмы сохранены в истории.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось выключить movie-канал" },
      { status: 500 },
    );
  }
}
