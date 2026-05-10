import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { buildSuperUploadSchedule } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

const bodySchema = z.object({
  sourceVideoDbId: z.string().min(1),
  accountId: z.string().min(1),
  templateId: z.string().min(1),
  clipsCount: z.coerce.number().int().min(1).max(30).default(10),
  clipSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(60),
  intervalMin: z.coerce.number().int().min(5).max(120).default(45),
  intervalMax: z.coerce.number().int().min(5).max(180).default(60),
  hookMode: z.string().max(80).default("AUTO_BEST_MIX"),
  titlePrefix: z.string().max(80).default("auto mix"),
});

function getHookPrefix(input: { hookMode: string; titlePrefix: string }) {
  const mode = input.hookMode.trim().toUpperCase();

  if (!mode || mode === "AUTO_BEST_MIX") {
    return input.titlePrefix.trim() || "auto mix";
  }

  if (mode === "ENDING_SURVIVAL_IMPOSSIBLE") return "auto mix";
  if (mode === "SURVIVAL_SUSPENSE") return "auto mix";
  if (mode === "FUNNY_FAIL") return "auto mix";

  return input.titlePrefix.trim() || "auto mix";
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const sourceVideo = await withDbRetry(() =>
      prisma.factorySourceVideo.findUnique({
        where: {
          id: body.sourceVideoDbId,
        },
      }),
    );

    if (!sourceVideo) {
      return NextResponse.json(
        {
          error: "Source video не найден. Сначала проанализируй канал.",
        },
        {
          status: 404,
        },
      );
    }

    const account = await withDbRetry(() =>
      prisma.factoryAccount.findUnique({
        where: {
          id: body.accountId,
        },
        select: {
          id: true,
          name: true,
          platform: true,
        },
      }),
    );

    if (!account) {
      return NextResponse.json(
        {
          error: "Аккаунт публикации не найден",
        },
        {
          status: 404,
        },
      );
    }

    const template = await withDbRetry(() =>
      prisma.factoryTemplate.findUnique({
        where: {
          id: body.templateId,
        },
        select: {
          id: true,
          name: true,
        },
      }),
    );

    if (!template) {
      return NextResponse.json(
        {
          error: "Шаблон Amelia не найден",
        },
        {
          status: 404,
        },
      );
    }

    const schedule = await buildSuperUploadSchedule({
      clipsCount: body.clipsCount,
      intervalMin: body.intervalMin,
      intervalMax: body.intervalMax,
    });

    const titlePrefix = getHookPrefix({
      hookMode: body.hookMode,
      titlePrefix: body.titlePrefix,
    });

    const result = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        const pack = await tx.factorySuperUploadPackage.create({
          data: {
            sourceVideoId: sourceVideo.id,
            accountId: account.id,
            accountName: account.name,
            game: "ROBLOX",
            clipsCount: body.clipsCount,
            clipSeconds: body.clipSeconds,
            intervalMin: body.intervalMin,
            intervalMax: body.intervalMax,
            scheduleMode: "ANALYTICS_BEST_WINDOW",
            hookMode: body.hookMode,
            titlePrefix,
            status: "CREATED",
            recommendation: `Вечер/ночь New York на основе аналитики. Лучший час: ${schedule.bestHour}:00 NY. Интервал ${body.intervalMin}-${body.intervalMax} минут. До 10 роликов за ночь, большие пакеты растягиваются на несколько дней.`,
          },
        });

        const jobs = [];

        for (const slot of schedule.slots) {
          const job = await tx.factoryJob.create({
            data: {
              sourceUrl: sourceVideo.sourceUrl,
              sourceFilePath: null,
              sourceStorageKey: null,
              sourceOriginalName: sourceVideo.title,
              sourceSizeBytes: null,
              clipSeconds: body.clipSeconds,
              clipStartIndex: slot.index - 1,
              titlePrefix,
              game: "ROBLOX",
              templateId: template.id,
              platforms: [account.platform],
              status: "QUEUED",
              totalClips: 0,
              progress: 0,
              progressLabel: `СУПЕР ЗАЛИВ ${slot.index}/${schedule.slots.length}: ${slot.label} New York · день ${slot.dayIndex}`,
              publishTiming: "USA_SMART",
              scheduledAt: slot.scheduledAt,
              cutMode: "SEQUENTIAL",
              smartStepSeconds: 10,
              smartCandidates: 80,
              smartMinGapSeconds: 30,
              cancelRequested: false,
              superUploadPackageId: pack.id,
              targets: {
                create: {
                  accountId: account.id,
                  platform: account.platform,
                  templateId: template.id,
                  titlePrefix,
                  maxClips: 1,
                },
              },
            },
          });

          jobs.push(job);
        }

        await tx.factorySourceVideo.update({
          where: {
            id: sourceVideo.id,
          },
          data: {
            isUsed: true,
            usedAt: new Date(),
          },
        });

        return {
          pack,
          jobs,
        };
      }),
    );

    return NextResponse.json({
      package: result.pack,
      jobs: result.jobs,
      schedule: schedule.slots,
      bestHour: schedule.bestHour,
      windowStart: schedule.windowStart,
      perDay: schedule.perDay,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректные данные",
        },
        {
          status: 400,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось создать супер-пакет",
      },
      {
        status: 500,
      },
    );
  }
}
