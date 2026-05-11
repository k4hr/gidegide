import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { buildSuperUploadSchedule } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

const RANDOM_TEMPLATE_ID = "RANDOM";

const bodySchema = z.object({
  sourceVideoDbId: z.string().min(1),
  accountId: z.string().min(1),
  templateId: z.string().min(1),
  clipsCount: z.coerce.number().int().min(1).max(30).default(10),
  clipSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]).default(60),
  hookPreviewSeconds: z.coerce.number().int().min(3).max(10).default(8),
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

  if (mode === "IMPOSSIBLE_SUSPENSE") return "HOOK:IMPOSSIBLE,SUSPENSE";
  if (mode === "SURVIVAL_ENDING") return "HOOK:SURVIVAL,ENDING";
  if (mode === "FUNNY_FAIL") return "HOOK:FUNNY,FAIL";
  if (mode === "SUSPENSE_ENDING") return "HOOK:SUSPENSE,ENDING";
  if (mode === "ENDING_SURVIVAL_IMPOSSIBLE") return "HOOK:ENDING,SURVIVAL,IMPOSSIBLE";
  if (mode === "SURVIVAL_SUSPENSE") return "HOOK:SURVIVAL,SUSPENSE";

  return input.titlePrefix.trim() || "auto mix";
}

async function resolveTemplates(templateId: string) {
  if (templateId === RANDOM_TEMPLATE_ID) {
    const templates = await withDbRetry(() =>
      prisma.factoryTemplate.findMany({
        where: {
          assetId: {
            not: null,
          },
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: [
          { isDefault: "desc" },
          { createdAt: "asc" },
        ],
      }),
    );

    if (templates.length === 0) {
      throw new Error("Нет Amelia-шаблонов с видео. Загрузи видео персонажа и создай шаблон.");
    }

    return templates;
  }

  const template = await withDbRetry(() =>
    prisma.factoryTemplate.findUnique({
      where: {
        id: templateId,
      },
      select: {
        id: true,
        name: true,
      },
    }),
  );

  if (!template) {
    throw new Error("Шаблон Amelia не найден");
  }

  return [template];
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

    const templates = await resolveTemplates(body.templateId);

    const schedule = await buildSuperUploadSchedule({
      clipsCount: body.clipsCount,
      intervalMin: body.intervalMin,
      intervalMax: body.intervalMax,
    });

    const titlePrefix = getHookPrefix({
      hookMode: body.hookMode,
      titlePrefix: body.titlePrefix,
    });

    const pack = await withDbRetry(() =>
      prisma.factorySuperUploadPackage.create({
        data: {
          sourceVideoId: sourceVideo.id,
          accountId: account.id,
          accountName: account.name,
          game: "ROBLOX",
          clipsCount: body.clipsCount,
          clipSeconds: body.clipSeconds,
          hookPreviewSeconds: body.hookPreviewSeconds,
          intervalMin: body.intervalMin,
          intervalMax: body.intervalMax,
          scheduleMode: "ANALYTICS_BEST_WINDOW",
          hookMode: body.hookMode,
          titlePrefix,
          status: "CREATED",
          recommendation: `Вечер/ночь New York на основе аналитики. Лучший час: ${schedule.bestHour}:00 NY. Hook preview ${body.hookPreviewSeconds} сек. Интервал ${body.intervalMin}-${body.intervalMax} минут. До 10 роликов за ночь, большие пакеты растягиваются на несколько дней.`,
        },
      }),
    );

    const jobs = [];

    for (const slot of schedule.slots) {
      const template = templates[(slot.index - 1) % templates.length];

      const job = await withDbRetry(() =>
        prisma.factoryJob.create({
          data: {
            sourceUrl: sourceVideo.sourceUrl,
            sourceFilePath: null,
            sourceStorageKey: null,
            sourceOriginalName: sourceVideo.title,
            sourceSizeBytes: null,
            clipSeconds: body.clipSeconds,
            hookPreviewSeconds: body.hookPreviewSeconds,
            clipStartIndex: slot.index - 1,
            titlePrefix,
            game: "ROBLOX",
            templateId: template.id,
            platforms: [account.platform],
            status: "QUEUED",
            totalClips: 0,
            progress: 0,
            progressLabel: `СУПЕР ЗАЛИВ ${slot.index}/${schedule.slots.length}: ${slot.label} New York · hook ${body.hookPreviewSeconds} сек`,
            publishTiming: "USA_SMART",
            scheduledAt: slot.scheduledAt,
            cutMode: "SMART_HOOK_AI",
            smartStepSeconds: 6,
            smartCandidates: 60,
            smartMinGapSeconds: Math.max(30, body.clipSeconds),
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
        }),
      );

      jobs.push(job);
    }

    await withDbRetry(() =>
      prisma.factorySourceVideo.update({
        where: {
          id: sourceVideo.id,
        },
        data: {
          isUsed: true,
          usedAt: new Date(),
        },
      }),
    );

    return NextResponse.json({
      package: pack,
      jobs,
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
