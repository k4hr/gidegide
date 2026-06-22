import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";
import { withDbRetry } from "../../../../../lib/factory/db-retry";
import {
  addSuperUploadDonor,
  buildTodayCandidates,
  listSuperUploadDonors,
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
  sourceUrl: z.string().min(3, "Вставь ссылку на YouTube-канал, видео или @handle"),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  try {
    const donors = await listSuperUploadDonors();
    const candidates = await buildTodayCandidates({ limit: 10 });

    return NextResponse.json({
      donors: donors.map(serializeDonor),
      candidates,
      summary: {
        donors: donors.length,
        active: donors.filter((donor) => donor.isActive).length,
        candidates: candidates.length,
        urgent: candidates.filter((video) => video.viralChance >= 80).length,
        test: candidates.filter(
          (video) => video.viralChance >= 60 && video.viralChance < 80,
        ).length,
        weak: candidates.filter((video) => video.viralChance < 60).length,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить доноров",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = postSchema.parse(await request.json());
    const sourceUrl = body.sourceUrl;
    if (!sourceUrl) {
      return NextResponse.json({ error: "Вставь ссылку на YouTube-канал, видео или @handle" }, { status: 400 });
    }
    const result = await addSuperUploadDonor({
      sourceUrl,
    });
    const candidates = await buildTodayCandidates({ limit: 10 });

    return NextResponse.json({
      donor: serializeDonor(result.donor),
      analysis: result.analysis,
      candidates,
      message: `Донор сохранен: ${result.donor.channelTitle}. Видео найдено: ${result.analysis.totalSeen}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректные данные",
        },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось добавить донора",
      },
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
    const candidates = await buildTodayCandidates({ limit: 10 });

    return NextResponse.json({
      donor: serializeDonor(donor),
      candidates,
      message: "Донор выключен. История source videos сохранена.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректные данные",
        },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось выключить донора",
      },
      { status: 500 },
    );
  }
}
