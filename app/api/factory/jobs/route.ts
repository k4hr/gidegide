import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { extFromName, safeFileName } from "@/lib/factory/video";
import { getR2Prefix, uploadBufferToR2 } from "@/lib/factory/r2";
import { getGameMeta } from "@/lib/factory/games";
import { withDbRetry } from "@/lib/factory/db-retry";
import {
  formatMoscowScheduledAtForLabel,
  formatScheduledAtForLabel,
  getNextNewYorkPublishAt,
  getPublishTimingLabel,
  getUsaSmartUploadSlots,
  USA_SMART_CLIPS_PER_SLOT,
} from "@/lib/factory/schedule";

export const runtime = "nodejs";

const gameSchema = z.enum([
  "ROBLOX",
  "FORTNITE",
  "MINECRAFT",
  "BRAWL_STARS",
  "DOTA2",
  "OTHER",
]);

const publishTimingSchema = z
  .enum(["NOW", "NY_14", "NY_17", "NY_20", "NY_22", "USA_SMART"])
  .default("NOW");

const cutModeSchema = z
  .enum(["SEQUENTIAL", "SMART_LITE", "SMART_HOOK_AI"])
  .default("SEQUENTIAL");

const packageModeSchema = z
  .enum(["NORMAL", "LONG_USA_DAILY"])
  .default("NORMAL");

const LONG_USA_DAILY_CLIPS_PER_DAY = Number(
  process.env.FACTORY_LONG_USA_DAILY_CLIPS_PER_DAY ?? 10,
);

const LONG_USA_DAILY_SOURCE_SECONDS = Number(
  process.env.FACTORY_LONG_USA_DAILY_SOURCE_SECONDS ?? 3600,
);

const LONG_USA_DAILY_NY_HOUR = Number(
  process.env.FACTORY_LONG_USA_DAILY_NY_HOUR ?? 14,
);

const targetSchema = z.object({
  accountId: z.string().min(1),
  templateId: z.string().optional().nullable(),
  titlePrefix: z.string().max(80).optional().nullable(),
  maxClips: z.coerce.number().int().min(1).max(100).default(10),
});

const smartSettingsSchema = z.object({
  cutMode: cutModeSchema,
  smartStepSeconds: z.coerce.number().int().min(5).max(30).default(10),
  smartCandidates: z.coerce.number().int().min(10).max(200).default(80),
  smartMinGapSeconds: z.coerce.number().int().min(10).max(120).default(30),
});

const jsonCreateJobSchema = z
  .object({
    sourceUrl: z.string().url(),
    clipSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    game: gameSchema.default("OTHER"),
    titlePrefix: z.string().max(80).optional(),
    templateId: z.string().optional().nullable(),
    publishTiming: publishTimingSchema,
    packageMode: packageModeSchema.optional(),
    targets: z.array(targetSchema).min(1),
  })
  .merge(smartSettingsSchema);

type ParsedTarget = z.infer<typeof targetSchema>;
type ParsedPublishTiming = z.infer<typeof publishTimingSchema>;
type ParsedGame = z.infer<typeof gameSchema>;
type ParsedCutMode = z.infer<typeof cutModeSchema>;

function parseClipSeconds(value: FormDataEntryValue | null) {
  const numberValue = Number(value);

  if (![30, 45, 60].includes(numberValue)) {
    throw new Error("Некорректная длина клипа");
  }

  return numberValue;
}

function parseGame(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    return "OTHER" as const;
  }

  return gameSchema.parse(value);
}

function parsePublishTiming(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    return "NOW" as const;
  }

  return publishTimingSchema.parse(value);
}

function parsePackageMode(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    return "NORMAL" as const;
  }

  return packageModeSchema.parse(value);
}

function parseSmartSettings(formData: FormData) {
  return smartSettingsSchema.parse({
    cutMode: formData.get("cutMode") || "SEQUENTIAL",
    smartStepSeconds: formData.get("smartStepSeconds") || 10,
    smartCandidates: formData.get("smartCandidates") || 80,
    smartMinGapSeconds: formData.get("smartMinGapSeconds") || 30,
  });
}

function parseTargets(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    throw new Error("Выбери хотя бы один аккаунт публикации");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Не получилось прочитать выбранные аккаунты публикации");
  }

  const targets = z.array(targetSchema).min(1).parse(parsed);

  return normalizeTargets(targets);
}

function normalizeTargets(targets: ParsedTarget[]) {
  const byAccountId = new Map<string, ParsedTarget>();

  for (const target of targets) {
    const accountId = target.accountId.trim();

    if (!accountId) continue;

    byAccountId.set(accountId, {
      accountId,
      templateId: target.templateId?.trim() || null,
      titlePrefix: target.titlePrefix?.trim() || null,
      maxClips: Math.max(1, Math.min(100, Number(target.maxClips || 10))),
    });
  }

  const normalized = Array.from(byAccountId.values());

  if (normalized.length === 0) {
    throw new Error("Выбери хотя бы один аккаунт публикации");
  }

  return normalized;
}

function normalizeTargetsForUsaSmart(targets: ParsedTarget[]) {
  return normalizeTargets(targets).map((target) => ({
    ...target,
    maxClips: USA_SMART_CLIPS_PER_SLOT,
  }));
}

function normalizeTargetsForLongUsaDaily(targets: ParsedTarget[]) {
  const clipsPerDay = Math.max(
    1,
    Math.min(100, Math.round(LONG_USA_DAILY_CLIPS_PER_DAY) || 10),
  );

  return normalizeTargets(targets).map((target) => ({
    ...target,
    maxClips: clipsPerDay,
  }));
}

function getLongUsaDailyDays(clipSeconds: number) {
  const clipsPerDay = Math.max(
    1,
    Math.min(100, Math.round(LONG_USA_DAILY_CLIPS_PER_DAY) || 10),
  );
  const sourceSeconds = Math.max(
    clipSeconds,
    LONG_USA_DAILY_SOURCE_SECONDS || 3600,
  );
  const totalClips = Math.max(1, Math.ceil(sourceSeconds / clipSeconds));

  return Math.max(1, Math.ceil(totalClips / clipsPerDay));
}

function getLongUsaDailyScheduledAt(dayOffset: number, now = new Date()) {
  const scheduledAt = getNextNewYorkPublishAt("NY_14", now);

  if (!scheduledAt) {
    throw new Error("Не получилось посчитать расписание USA daily package");
  }

  const base = new Date(scheduledAt);
  base.setUTCDate(base.getUTCDate() + dayOffset);

  if (
    Number.isFinite(LONG_USA_DAILY_NY_HOUR) &&
    LONG_USA_DAILY_NY_HOUR !== 14
  ) {
    const deltaHours = LONG_USA_DAILY_NY_HOUR - 14;
    base.setUTCHours(base.getUTCHours() + deltaHours);
  }

  return base;
}

function buildSchedule(publishTiming: ParsedPublishTiming) {
  const scheduledAt = getNextNewYorkPublishAt(publishTiming);

  if (!scheduledAt) {
    return {
      scheduledAt: null,
      progressLabel: "Задача создана",
    };
  }

  return {
    scheduledAt,
    progressLabel: `Задача создана. Запланировано: ${getPublishTimingLabel(
      publishTiming,
    )} — ${formatScheduledAtForLabel(scheduledAt)} New York`,
  };
}

async function resolveTemplateId(templateId?: string | null) {
  if (templateId?.trim()) {
    return templateId.trim();
  }

  const defaultTemplate = await withDbRetry(() =>
    prisma.factoryTemplate.findFirst({
      where: {
        isDefault: true,
      },
      select: {
        id: true,
      },
    }),
  );

  return defaultTemplate?.id ?? null;
}

async function createJobWithTargets(input: {
  sourceUrl: string | null;
  sourceFilePath?: string | null;
  sourceStorageKey?: string | null;
  sourceOriginalName?: string | null;
  sourceSizeBytes?: number | null;
  clipSeconds: number;
  clipStartIndex?: number;
  titlePrefix: string;
  game: ParsedGame;
  globalTemplateId: string | null;
  publishTiming: ParsedPublishTiming;
  scheduledAt: Date | null;
  progressLabel: string;
  targets: ParsedTarget[];
  cutMode: ParsedCutMode;
  smartStepSeconds: number;
  smartCandidates: number;
  smartMinGapSeconds: number;
}) {
  const normalizedTargets = normalizeTargets(input.targets);
  const accountIds = normalizedTargets.map((target) => target.accountId);

  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const accounts = await tx.factoryAccount.findMany({
        where: {
          id: {
            in: accountIds,
          },
        },
        select: {
          id: true,
          platform: true,
          name: true,
        },
      });

      if (accounts.length !== accountIds.length) {
        throw new Error("Один или несколько аккаунтов публикации не найдены");
      }

      const accountById = new Map(
        accounts.map((account) => [account.id, account]),
      );

      const templateIds = Array.from(
        new Set(
          normalizedTargets
            .map((target) => target.templateId || input.globalTemplateId)
            .filter(Boolean) as string[],
        ),
      );

      if (templateIds.length === 0) {
        throw new Error(
          "Не выбран шаблон публикации. Создай шаблон и выбери его для аккаунта.",
        );
      }

      const templates = await tx.factoryTemplate.findMany({
        where: {
          id: {
            in: templateIds,
          },
        },
        select: {
          id: true,
        },
      });

      if (templates.length !== templateIds.length) {
        throw new Error("Один или несколько шаблонов публикации не найдены");
      }

      const platforms = Array.from(
        new Set(accounts.map((account) => account.platform)),
      );

      const job = await tx.factoryJob.create({
        data: {
          sourceUrl: input.sourceUrl,
          sourceFilePath: input.sourceFilePath ?? null,
          sourceStorageKey: input.sourceStorageKey ?? null,
          sourceOriginalName: input.sourceOriginalName ?? null,
          sourceSizeBytes: input.sourceSizeBytes ?? null,
          clipSeconds: input.clipSeconds,
          clipStartIndex: input.clipStartIndex ?? 0,
          titlePrefix: input.titlePrefix,
          game: input.game,
          templateId: input.globalTemplateId,
          platforms,
          publishTiming: input.publishTiming,
          scheduledAt: input.scheduledAt,
          cutMode: input.cutMode,
          smartStepSeconds: input.smartStepSeconds,
          smartCandidates: input.smartCandidates,
          smartMinGapSeconds: input.smartMinGapSeconds,
          progress: 0,
          progressLabel: input.progressLabel,
          cancelRequested: false,
          targets: {
            create: normalizedTargets.map((target) => {
              const account = accountById.get(target.accountId);
              const targetTemplateId =
                target.templateId || input.globalTemplateId;

              if (!account) {
                throw new Error("Аккаунт публикации не найден");
              }

              if (!targetTemplateId) {
                throw new Error(
                  `Для аккаунта "${account.name}" не выбран шаблон публикации`,
                );
              }

              return {
                accountId: account.id,
                platform: account.platform,
                templateId: targetTemplateId,
                titlePrefix: target.titlePrefix || input.titlePrefix,
                maxClips: target.maxClips,
              };
            }),
          },
        },
        include: {
          targets: {
            include: {
              account: true,
              template: true,
            },
          },
        },
      });

      if (job.targets.length === 0) {
        throw new Error(
          "Задача не создана: аккаунты публикации не сохранились",
        );
      }

      return job;
    }),
  );
}

async function createLongUsaDailyJobs(input: {
  sourceUrl: string | null;
  sourceFilePath?: string | null;
  sourceStorageKey?: string | null;
  sourceOriginalName?: string | null;
  sourceSizeBytes?: number | null;
  clipSeconds: number;
  titlePrefix: string;
  game: ParsedGame;
  globalTemplateId: string | null;
  targets: ParsedTarget[];
  cutMode: ParsedCutMode;
  smartStepSeconds: number;
  smartCandidates: number;
  smartMinGapSeconds: number;
}) {
  const dailyTargets = normalizeTargetsForLongUsaDaily(input.targets);
  const clipsPerDay = Math.max(
    1,
    Math.min(100, Math.round(LONG_USA_DAILY_CLIPS_PER_DAY) || 10),
  );
  const days = getLongUsaDailyDays(input.clipSeconds);
  const jobs = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const scheduledAt = getLongUsaDailyScheduledAt(dayIndex);

    const job = await createJobWithTargets({
      sourceUrl: input.sourceUrl,
      sourceFilePath: input.sourceFilePath ?? null,
      sourceStorageKey: input.sourceStorageKey ?? null,
      sourceOriginalName: input.sourceOriginalName ?? null,
      sourceSizeBytes: input.sourceSizeBytes ?? null,
      clipSeconds: input.clipSeconds,
      clipStartIndex: dayIndex * clipsPerDay,
      titlePrefix: input.titlePrefix,
      game: input.game,
      globalTemplateId: input.globalTemplateId,
      publishTiming: "USA_SMART",
      scheduledAt,
      progressLabel: `Длинное видео / USA пакет: день ${dayIndex + 1}/${days}, по ${clipsPerDay} роликов. Старт: ${formatScheduledAtForLabel(
        scheduledAt,
      )} New York`,
      targets: dailyTargets,
      cutMode: input.cutMode,
      smartStepSeconds: input.smartStepSeconds,
      smartCandidates: input.smartCandidates,
      smartMinGapSeconds: input.smartMinGapSeconds,
    });

    jobs.push(job);
  }

  return jobs;
}

async function createUsaSmartJobs(input: {
  sourceUrl: string | null;
  sourceFilePath?: string | null;
  sourceStorageKey?: string | null;
  sourceOriginalName?: string | null;
  sourceSizeBytes?: number | null;
  clipSeconds: number;
  titlePrefix: string;
  game: ParsedGame;
  globalTemplateId: string | null;
  targets: ParsedTarget[];
  cutMode: ParsedCutMode;
  smartStepSeconds: number;
  smartCandidates: number;
  smartMinGapSeconds: number;
}) {
  const slots = getUsaSmartUploadSlots();
  const smartTargets = normalizeTargetsForUsaSmart(input.targets);
  const jobs = [];

  for (const slot of slots) {
    const job = await createJobWithTargets({
      sourceUrl: input.sourceUrl,
      sourceFilePath: input.sourceFilePath ?? null,
      sourceStorageKey: input.sourceStorageKey ?? null,
      sourceOriginalName: input.sourceOriginalName ?? null,
      sourceSizeBytes: input.sourceSizeBytes ?? null,
      clipSeconds: input.clipSeconds,
      clipStartIndex: slot.index - 1,
      titlePrefix: input.titlePrefix,
      game: input.game,
      globalTemplateId: input.globalTemplateId,
      publishTiming: "USA_SMART",
      scheduledAt: slot.scheduledAt,
      progressLabel: `USA smart ${slot.index}/${slots.length}: ${slot.label}. Старт: ${formatMoscowScheduledAtForLabel(
        slot.scheduledAt,
      )}`,
      targets: smartTargets,
      cutMode: input.cutMode,
      smartStepSeconds: input.smartStepSeconds,
      smartCandidates: input.smartCandidates,
      smartMinGapSeconds: input.smartMinGapSeconds,
    });

    jobs.push(job);
  }

  return jobs;
}

export async function GET() {
  try {
    const jobs = await withDbRetry(() =>
      prisma.factoryJob.findMany({
        orderBy: {
          createdAt: "desc",
        },
        take: 30,
        include: {
          template: true,
          targets: {
            include: {
              account: true,
              template: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          clips: {
            orderBy: {
              index: "asc",
            },
            include: {
              publishes: {
                include: {
                  account: true,
                  target: {
                    include: {
                      template: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );

    return NextResponse.json({
      jobs,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить задачи",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureFactoryDirs();

    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();

      const game = parseGame(formData.get("game"));
      const gameMeta = getGameMeta(game);
      const publishTiming = parsePublishTiming(formData.get("publishTiming"));
      const packageMode = parsePackageMode(formData.get("packageMode"));
      const smartSettings = parseSmartSettings(formData);

      const rawTitlePrefix = z
        .string()
        .max(80)
        .optional()
        .parse(formData.get("titlePrefix") || undefined);

      const titlePrefix = rawTitlePrefix?.trim() || gameMeta.titlePrefix;

      const templateId = await resolveTemplateId(
        z
          .string()
          .optional()
          .nullable()
          .parse(formData.get("templateId") || null),
      );

      const clipSeconds = parseClipSeconds(formData.get("clipSeconds"));
      const targets = parseTargets(formData.get("targets"));
      const file = formData.get("sourceFile");

      if (!(file instanceof File)) {
        return NextResponse.json(
          {
            error: "Исходный MP4-файл не найден",
          },
          {
            status: 400,
          },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = extFromName(file.name);
      const tempId = crypto.randomUUID();
      const fileName = `${tempId}-${safeFileName(file.name)}${ext}`;
      const filePath = path.join(FACTORY_SOURCE_DIR, fileName);

      await writeFile(filePath, buffer);

      const storageKey = `${getR2Prefix()}/jobs/${tempId}/source/${fileName}`;

      const uploadedKey = await uploadBufferToR2({
        key: storageKey,
        buffer,
        contentType: file.type || "video/mp4",
      });

      if (packageMode === "LONG_USA_DAILY") {
        const jobs = await createLongUsaDailyJobs({
          sourceUrl: null,
          sourceFilePath: filePath,
          sourceStorageKey: uploadedKey,
          sourceOriginalName: file.name,
          sourceSizeBytes: buffer.byteLength,
          clipSeconds,
          titlePrefix,
          game,
          globalTemplateId: templateId,
          targets,
          ...smartSettings,
        });

        return NextResponse.json({
          jobs,
        });
      }

      if (publishTiming === "USA_SMART") {
        const jobs = await createUsaSmartJobs({
          sourceUrl: null,
          sourceFilePath: filePath,
          sourceStorageKey: uploadedKey,
          sourceOriginalName: file.name,
          sourceSizeBytes: buffer.byteLength,
          clipSeconds,
          titlePrefix,
          game,
          globalTemplateId: templateId,
          targets,
          ...smartSettings,
        });

        return NextResponse.json({
          jobs,
        });
      }

      const schedule = buildSchedule(publishTiming);

      const job = await createJobWithTargets({
        sourceUrl: null,
        sourceFilePath: filePath,
        sourceStorageKey: uploadedKey,
        sourceOriginalName: file.name,
        sourceSizeBytes: buffer.byteLength,
        clipSeconds,
        titlePrefix,
        game,
        globalTemplateId: templateId,
        publishTiming,
        scheduledAt: schedule.scheduledAt,
        progressLabel: schedule.progressLabel,
        targets,
        ...smartSettings,
      });

      return NextResponse.json({
        job,
      });
    }

    const body = await request.json();
    const data = jsonCreateJobSchema.parse(body);
    const gameMeta = getGameMeta(data.game);
    const templateId = await resolveTemplateId(data.templateId);
    const titlePrefix = data.titlePrefix?.trim() || gameMeta.titlePrefix;
    const targets = normalizeTargets(data.targets);

    if ((data.packageMode ?? "NORMAL") === "LONG_USA_DAILY") {
      const jobs = await createLongUsaDailyJobs({
        sourceUrl: data.sourceUrl,
        clipSeconds: data.clipSeconds,
        titlePrefix,
        game: data.game,
        globalTemplateId: templateId,
        targets,
        cutMode: data.cutMode,
        smartStepSeconds: data.smartStepSeconds,
        smartCandidates: data.smartCandidates,
        smartMinGapSeconds: data.smartMinGapSeconds,
      });

      return NextResponse.json({
        jobs,
      });
    }

    if (data.publishTiming === "USA_SMART") {
      const jobs = await createUsaSmartJobs({
        sourceUrl: data.sourceUrl,
        clipSeconds: data.clipSeconds,
        titlePrefix,
        game: data.game,
        globalTemplateId: templateId,
        targets,
        cutMode: data.cutMode,
        smartStepSeconds: data.smartStepSeconds,
        smartCandidates: data.smartCandidates,
        smartMinGapSeconds: data.smartMinGapSeconds,
      });

      return NextResponse.json({
        jobs,
      });
    }

    const schedule = buildSchedule(data.publishTiming);

    const job = await createJobWithTargets({
      sourceUrl: data.sourceUrl,
      clipSeconds: data.clipSeconds,
      titlePrefix,
      game: data.game,
      globalTemplateId: templateId,
      publishTiming: data.publishTiming,
      scheduledAt: schedule.scheduledAt,
      progressLabel: schedule.progressLabel,
      targets,
      cutMode: data.cutMode,
      smartStepSeconds: data.smartStepSeconds,
      smartCandidates: data.smartCandidates,
      smartMinGapSeconds: data.smartMinGapSeconds,
    });

    return NextResponse.json({
      job,
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
            : "Не получилось создать задачу",
      },
      {
        status: 500,
      },
    );
  }
}
