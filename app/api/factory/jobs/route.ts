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
  formatScheduledAtForLabel,
  getNextNewYorkPublishAt,
  getPublishTimingLabel,
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
  .enum(["NOW", "NY_14", "NY_17", "NY_20", "NY_22"])
  .default("NOW");

const targetSchema = z.object({
  accountId: z.string().min(1),
  templateId: z.string().optional().nullable(),
  titlePrefix: z.string().max(80).optional().nullable(),
  maxClips: z.coerce.number().int().min(1).max(100).default(10),
});

const jsonCreateJobSchema = z.object({
  sourceUrl: z.string().url(),
  clipSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  game: gameSchema.default("OTHER"),
  titlePrefix: z.string().max(80).optional(),
  templateId: z.string().optional().nullable(),
  publishTiming: publishTimingSchema,
  targets: z.array(targetSchema).min(1),
});

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

function parseTargets(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    throw new Error("Выбери хотя бы один аккаунт для публикации");
  }

  const parsed = JSON.parse(value) as unknown;

  return z.array(targetSchema).min(1).parse(parsed);
}

function buildSchedule(publishTiming: z.infer<typeof publishTimingSchema>) {
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
  if (templateId) {
    return templateId;
  }

  const defaultTemplate = await prisma.factoryTemplate.findFirst({
    where: {
      isDefault: true,
    },
  });

  return defaultTemplate?.id ?? null;
}

async function createTargetsForJob(input: {
  jobId: string;
  globalTemplateId: string | null;
  globalTitlePrefix: string;
  targets: Array<z.infer<typeof targetSchema>>;
}) {
  const accountIds = Array.from(
    new Set(input.targets.map((target) => target.accountId)),
  );

  const accounts = await prisma.factoryAccount.findMany({
    where: {
      id: {
        in: accountIds,
      },
    },
  });

  if (accounts.length !== accountIds.length) {
    throw new Error("Один или несколько аккаунтов не найдены");
  }

  const accountById = new Map(accounts.map((account) => [account.id, account]));

  await prisma.factoryJobTarget.createMany({
    data: input.targets.map((target) => {
      const account = accountById.get(target.accountId);

      if (!account) {
        throw new Error("Аккаунт не найден");
      }

      return {
        jobId: input.jobId,
        accountId: account.id,
        platform: account.platform,
        templateId: target.templateId || input.globalTemplateId,
        titlePrefix: target.titlePrefix?.trim() || input.globalTitlePrefix,
        maxClips: target.maxClips,
      };
    }),
  });

  return Array.from(new Set(accounts.map((account) => account.platform)));
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
          error instanceof Error ? error.message : "Не получилось загрузить задачи",
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
      const schedule = buildSchedule(publishTiming);

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

      const job = await prisma.factoryJob.create({
        data: {
          sourceUrl: null,
          clipSeconds,
          titlePrefix,
          game,
          templateId,
          platforms: [],
          publishTiming,
          scheduledAt: schedule.scheduledAt,
          progress: 0,
          progressLabel:
            publishTiming === "NOW"
              ? "Загружаю исходный файл"
              : schedule.progressLabel,
          cancelRequested: false,
        },
      });

      const platforms = await createTargetsForJob({
        jobId: job.id,
        globalTemplateId: templateId,
        globalTitlePrefix: titlePrefix,
        targets,
      });

      await prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          platforms,
        },
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = extFromName(file.name);
      const fileName = `${job.id}-${safeFileName(file.name)}${ext}`;
      const filePath = path.join(FACTORY_SOURCE_DIR, fileName);
      const storageKey = `${getR2Prefix()}/jobs/${job.id}/source/${fileName}`;

      await writeFile(filePath, buffer);

      const uploadedKey = await uploadBufferToR2({
        key: storageKey,
        buffer,
        contentType: file.type || "video/mp4",
      });

      const updatedJob = await prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          sourceFilePath: filePath,
          sourceStorageKey: uploadedKey,
          sourceOriginalName: file.name,
          sourceSizeBytes: buffer.byteLength,
          progress: 0,
          progressLabel: schedule.progressLabel,
        },
      });

      return NextResponse.json({
        job: updatedJob,
      });
    }

    const body = await request.json();
    const data = jsonCreateJobSchema.parse(body);
    const gameMeta = getGameMeta(data.game);
    const templateId = await resolveTemplateId(data.templateId);
    const titlePrefix = data.titlePrefix?.trim() || gameMeta.titlePrefix;
    const schedule = buildSchedule(data.publishTiming);

    const job = await prisma.factoryJob.create({
      data: {
        sourceUrl: data.sourceUrl,
        clipSeconds: data.clipSeconds,
        titlePrefix,
        game: data.game,
        templateId,
        platforms: [],
        publishTiming: data.publishTiming,
        scheduledAt: schedule.scheduledAt,
        progress: 0,
        progressLabel: schedule.progressLabel,
        cancelRequested: false,
      },
    });

    const platforms = await createTargetsForJob({
      jobId: job.id,
      globalTemplateId: templateId,
      globalTitlePrefix: titlePrefix,
      targets: data.targets,
    });

    const updatedJob = await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        platforms,
      },
    });

    return NextResponse.json({
      job: updatedJob,
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
          error instanceof Error ? error.message : "Не получилось создать задачу",
      },
      {
        status: 500,
      },
    );
  }
}
