import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";
import { encodeMovieMomentsPrefix } from "../../../../../lib/factory/movie-moments";
import { MOVIE_MOMENTS_DONOR_KIND } from "../../../../../lib/factory/super-upload";

export const runtime = "nodejs";

const bodySchema = z.object({
  sourceVideoIds: z.array(z.string().min(1)).min(1).max(3),
  description: z.string().max(5000).optional().default(""),
  accountId: z.string().min(1),
  templateId: z.string().min(1).default("CENTER_VIDEO"),
  clipsPerMovie: z.number().int().min(1).max(40).default(10),
  clipSeconds: z.number().int().min(10).max(90).default(60),
  scheduledAt: z.string().optional().nullable(),
});

function parseScheduledAt(value?: string | null) {
  if (!value || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Некорректное время старта");
  return date;
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const scheduledAt = parseScheduledAt(body.scheduledAt);

    const resolvedTemplateId = body.templateId === "CENTER_VIDEO" ? null : body.templateId;

    const [account, template, videos] = await Promise.all([
      prisma.factoryAccount.findUnique({ where: { id: body.accountId } }),
      resolvedTemplateId
        ? prisma.factoryTemplate.findUnique({ where: { id: resolvedTemplateId }, include: { asset: true } })
        : Promise.resolve(null),
      prisma.factorySourceVideo.findMany({
        where: {
          id: { in: body.sourceVideoIds },
          sourceKind: MOVIE_MOMENTS_DONOR_KIND,
        },
        orderBy: [
          { viralChance: "desc" },
          { viewsPerDay: "desc" },
          { publishedAt: "desc" },
        ],
      }),
    ]);

    if (!account || account.platform !== "YOUTUBE") {
      return NextResponse.json({ error: "YouTube-аккаунт не найден" }, { status: 400 });
    }

    if (resolvedTemplateId && (!template || !template.asset)) {
      return NextResponse.json({ error: "Выбранный шаблон не найден или в нём нет видео" }, { status: 400 });
    }

    if (videos.length === 0) {
      return NextResponse.json({ error: "Выбранные фильмы не найдены" }, { status: 400 });
    }

    const jobs = [];

    for (let index = 0; index < videos.length; index += 1) {
      const video = videos[index];
      const startAt = scheduledAt ? new Date(scheduledAt.getTime() + index * 45 * 60 * 1000) : null;
      const movieTitle = video.title.replace(/\s+/g, " ").trim();
      const titlePrefix = encodeMovieMomentsPrefix(movieTitle);

      const pack = await prisma.factorySuperUploadPackage.create({
        data: {
          sourceVideoId: video.id,
          accountId: account.id,
          accountName: account.name,
          game: "OTHER",
          clipsCount: body.clipsPerMovie,
          clipSeconds: body.clipSeconds,
          hookPreviewSeconds: 0,
          intervalMin: 35,
          intervalMax: 50,
          scheduleMode: startAt ? "CUSTOM_START" : "NOW",
          hookMode: "MOVIE_MOMENTS_SMART_CUT",
          titlePrefix,
          status: "CREATED",
          recommendation: `Movie Moments: ${body.clipsPerMovie} clips from ${movieTitle}`,
        },
      });

      const job = await prisma.factoryJob.create({
        data: {
          sourceUrl: video.sourceUrl,
          sourceOriginalName: movieTitle,
          clipSeconds: body.clipSeconds,
          clipStartIndex: 0,
          titlePrefix,
          game: "OTHER",
          templateId: resolvedTemplateId,
          platforms: ["YOUTUBE"],
          publishTiming: startAt ? "USA_SMART" : "NOW",
          scheduledAt: startAt,
          cutMode: "MOVIE_SMART",
          smartStepSeconds: 60,
          smartCandidates: 160,
          smartMinGapSeconds: 600,
          hookPreviewSeconds: 0,
          renderFormat: "SHORTS_9_16",
          longVideoTitle: movieTitle,
          longVideoDescription: body.description.trim(),
          superUploadPackageId: pack.id,
          progress: 0,
          progressLabel: startAt
            ? `Movie Moments из YouTube создан. Старт: ${startAt.toLocaleString("ru-RU")}`
            : "Movie Moments из YouTube создан. RIP скачает фильм и выберет моменты.",
          targets: {
            create: {
              accountId: account.id,
              platform: "YOUTUBE",
              templateId: resolvedTemplateId,
              titlePrefix,
              maxClips: body.clipsPerMovie,
            },
          },
        },
        include: { targets: true },
      });

      await prisma.factorySourceVideo.update({
        where: { id: video.id },
        data: { isUsed: true, usedAt: new Date() },
      });

      jobs.push(job);
    }

    return NextResponse.json({
      jobs,
      message: `Создано фильмов: ${jobs.length}. План роликов: ${jobs.length * body.clipsPerMovie}.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось создать Movie Moments из YouTube" },
      { status: 500 },
    );
  }
}
