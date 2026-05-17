import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { buildSuperUploadSchedule, buildTodayCandidates } from "@/lib/factory/super-upload";

export const runtime = "nodejs";

const RANDOM_TEMPLATE_ID = "RANDOM";

function normalizeClipRange(input: {
  clipSeconds: number;
  clipMinSeconds?: number;
  clipMaxSeconds?: number;
}) {
  const rawMin = Number(input.clipMinSeconds ?? input.clipSeconds);
  const rawMax = Number(input.clipMaxSeconds ?? input.clipSeconds);
  const min = Math.max(10, Math.min(60, Math.round(Number.isFinite(rawMin) ? rawMin : input.clipSeconds)));
  const max = Math.max(min, Math.max(10, Math.min(60, Math.round(Number.isFinite(rawMax) ? rawMax : input.clipSeconds))));

  return {
    min,
    max,
    label: min === max ? `${max} сек` : `${min}–${max} сек`,
  };
}

function pickClipSeconds(index: number, min: number, max: number) {
  if (max <= min) return max;

  const ratios = [0, 0.35, 0.7, 1, 0.2, 0.55, 0.9, 0.1, 0.45, 0.8, 0.3, 0.65, 0.95];
  const ratio = ratios[index % ratios.length] ?? 0.5;

  return Math.max(min, Math.min(max, Math.round(min + (max - min) * ratio)));
}

const bodySchema = z.object({
  accountId: z.string().min(1),
  templateId: z.string().min(1),
  candidatesCount: z.coerce.number().int().min(1).max(30).default(10),
  clipSeconds: z.coerce.number().int().min(10).max(60).default(60),
  clipMinSeconds: z.coerce.number().int().min(10).max(60).optional(),
  clipMaxSeconds: z.coerce.number().int().min(10).max(60).optional(),
  clipLengthMode: z.string().max(40).default("FULL"),
  hookPreviewSeconds: z.coerce.number().int().min(3).max(10).default(8),
  intervalMin: z.coerce.number().int().min(5).max(180).default(45),
  intervalMax: z.coerce.number().int().min(5).max(240).default(60),
  windowStartHour: z.coerce.number().int().min(0).max(23).default(21),
  windowStartMinute: z.coerce.number().int().min(0).max(59).default(30),
  windowEndHour: z.coerce.number().int().min(0).max(23).default(23),
  windowEndMinute: z.coerce.number().int().min(0).max(59).default(45),
  fitInsideWindow: z.boolean().default(true),
});

function hookPrefixFromMode(mode: string) {
  const normalized = mode.trim().toUpperCase();

  if (normalized === "IMPOSSIBLE_SUSPENSE") return "HOOK:IMPOSSIBLE,SUSPENSE";
  if (normalized === "SURVIVAL_ENDING") return "HOOK:SURVIVAL,ENDING";
  if (normalized === "FUNNY_FAIL") return "HOOK:FUNNY,FAIL";
  if (normalized === "SUSPENSE_ENDING") return "HOOK:SUSPENSE,ENDING";
  if (normalized === "ENDING_SURVIVAL_IMPOSSIBLE") return "HOOK:ENDING,SURVIVAL,IMPOSSIBLE";
  if (normalized === "SURVIVAL_SUSPENSE") return "HOOK:SURVIVAL,SUSPENSE";

  return "auto mix";
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
      where: { id: templateId },
      select: { id: true, name: true },
    }),
  );

  if (!template) {
    throw new Error("Amelia-шаблон не найден");
  }

  return [template];
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const clipRange = normalizeClipRange(body);

    const account = await withDbRetry(() =>
      prisma.factoryAccount.findUnique({
        where: { id: body.accountId },
        select: { id: true, name: true, platform: true },
      }),
    );

    if (!account) {
      return NextResponse.json({ error: "YouTube-аккаунт не найден" }, { status: 404 });
    }

    const templates = await resolveTemplates(body.templateId);

    const candidates = await buildTodayCandidates({ limit: body.candidatesCount });
    const selected = candidates.slice(0, body.candidatesCount);

    if (selected.length === 0) {
      return NextResponse.json(
        {
          error: "Нет кандидатов дня. Сначала добавь доноров и нажми “Проверить всех доноров”.",
        },
        { status: 400 },
      );
    }

    const schedule = await buildSuperUploadSchedule({
      clipsCount: selected.length,
      intervalMin: body.intervalMin,
      intervalMax: body.intervalMax,
      windowStartHour: body.windowStartHour,
      windowStartMinute: body.windowStartMinute,
      windowEndHour: body.windowEndHour,
      windowEndMinute: body.windowEndMinute,
      fitInsideWindow: body.fitInsideWindow,
    });

    const packages = [];
    const jobs = [];

    for (const [index, sourceVideo] of selected.entries()) {
      const slot = schedule.slots[index];
      const template = templates[index % templates.length];
      const titlePrefix = hookPrefixFromMode(sourceVideo.suggestedHookMode);
      const jobClipSeconds = pickClipSeconds(index, clipRange.min, clipRange.max);

      const pack = await withDbRetry(() =>
        prisma.factorySuperUploadPackage.create({
          data: {
            sourceVideoId: sourceVideo.id,
            accountId: account.id,
            accountName: account.name,
            game: "ROBLOX",
            clipsCount: 1,
            clipSeconds: jobClipSeconds,
            hookPreviewSeconds: body.hookPreviewSeconds,
            intervalMin: body.intervalMin,
            intervalMax: body.intervalMax,
            scheduleMode: "DAILY_SCOUT_BEST_WINDOW",
            hookMode: sourceVideo.suggestedHookMode,
            titlePrefix,
            status: "CREATED",
            recommendation: `Пакет дня: кандидат #${index + 1}. Шанс ${sourceVideo.viralChance}/100. ${slot.label} New York. Длина: ${clipRange.label}. Hook preview: ${body.hookPreviewSeconds} сек. Окно: ${String(body.windowStartHour).padStart(2, "0")}:${String(body.windowStartMinute).padStart(2, "0")}–${String(body.windowEndHour).padStart(2, "0")}:${String(body.windowEndMinute).padStart(2, "0")} NY. Hook mode: ${sourceVideo.suggestedHookMode}.`,
          },
        }),
      );

      const job = await withDbRetry(() =>
        prisma.factoryJob.create({
          data: {
            sourceUrl: sourceVideo.sourceUrl,
            sourceFilePath: null,
            sourceStorageKey: null,
            sourceOriginalName: sourceVideo.title,
            sourceSizeBytes: null,
            clipSeconds: jobClipSeconds,
            hookPreviewSeconds: body.hookPreviewSeconds,
            clipStartIndex: 0,
            titlePrefix,
            game: "ROBLOX",
            templateId: template.id,
            platforms: [account.platform],
            status: "QUEUED",
            totalClips: 0,
            progress: 0,
            progressLabel: `ПАКЕТ ДНЯ ${index + 1}/${selected.length}: ${slot.label} New York · ${sourceVideo.viralChance}/100 · ${jobClipSeconds} сек · hook ${body.hookPreviewSeconds} сек`,
            publishTiming: "USA_SMART",
            scheduledAt: slot.scheduledAt,
            cutMode: "SMART_HOOK_AI",
            smartStepSeconds: 6,
            smartCandidates: 60,
            smartMinGapSeconds: Math.max(30, jobClipSeconds),
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

      await withDbRetry(() =>
        prisma.factorySourceVideo.update({
          where: { id: sourceVideo.id },
          data: { isUsed: true, usedAt: new Date() },
        }),
      );

      packages.push(pack);
      jobs.push(job);
    }

    return NextResponse.json({
      packages,
      jobs,
      schedule: schedule.slots,
      bestHour: schedule.bestHour,
      candidates: selected,
      message: `Пакет дня создан: ${jobs.length} задач. Длина: ${clipRange.label}. Hook: ${body.hookPreviewSeconds} сек. Окно NY: ${String(body.windowStartHour).padStart(2, "0")}:${String(body.windowStartMinute).padStart(2, "0")}–${String(body.windowEndHour).padStart(2, "0")}:${String(body.windowEndMinute).padStart(2, "0")}.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось собрать пакет дня",
      },
      { status: 500 },
    );
  }
}
