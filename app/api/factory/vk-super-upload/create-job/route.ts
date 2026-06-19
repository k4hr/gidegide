import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { buildRussianVkDescription } from "@/lib/factory/vk-super-upload";

export const runtime = "nodejs";

const RANDOM_TEMPLATE_ID = "RANDOM";
const CENTER_VIDEO_TEMPLATE_ID = "CENTER_VIDEO";

const bodySchema = z.object({
  candidateId: z.string().min(1),
  accountId: z.string().min(1),
  templateId: z.string().min(1).default(CENTER_VIDEO_TEMPLATE_ID),
  clipsCount: z.coerce.number().int().min(1).max(40).default(10),
  clipSeconds: z.coerce.number().int().min(10).max(90).default(60),
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(4500).optional(),
  publishMode: z.enum(["NOW", "WINDOW"]).default("WINDOW"),
  windowStartHour: z.coerce.number().int().min(0).max(23).default(14),
  windowEndHour: z.coerce.number().int().min(1).max(24).default(23),
  intervalMinutes: z.coerce.number().int().min(15).max(180).default(60),
  timeZone: z.string().trim().min(1).max(80).default("Europe/Moscow"),
  publishNow: z.boolean().optional(),
});

async function resolveTemplateId(templateId: string) {
  if (templateId === CENTER_VIDEO_TEMPLATE_ID) {
    return null;
  }

  if (templateId === RANDOM_TEMPLATE_ID) {
    const template = await withDbRetry(() =>
      prisma.factoryTemplate.findFirst({
        where: { assetId: { not: null } },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { id: true },
      }),
    );

    if (!template) {
      throw new Error("Нет шаблона с видео персонажа. Сначала создай шаблон.");
    }

    return template.id;
  }

  const template = await withDbRetry(() =>
    prisma.factoryTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    }),
  );

  if (!template) {
    throw new Error("Шаблон не найден");
  }

  return template.id;
}

function buildUploadScheduleConfig(input: {
  publishMode: "NOW" | "WINDOW";
  windowStartHour: number;
  windowEndHour: number;
  intervalMinutes: number;
  timeZone: string;
}) {
  if (input.publishMode === "NOW") {
    return null;
  }

  const startHour = Math.max(0, Math.min(23, input.windowStartHour));
  const endHour = Math.max(startHour + 1, Math.min(24, input.windowEndHour));
  const intervalMinutes = Math.max(15, Math.min(180, input.intervalMinutes));

  return {
    type: "WINDOW_INTERVAL",
    startHour,
    endHour,
    intervalMinutes,
    timeZone: input.timeZone || "Europe/Moscow",
  };
}

function getFirstScheduledAt(
  config: ReturnType<typeof buildUploadScheduleConfig>,
) {
  if (!config) return null;

  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  const localHour = parts.hour === 24 ? 0 : parts.hour;
  const localMinute = parts.minute ?? 0;
  const minutesNow = localHour * 60 + localMinute;
  const startMinutes = config.startHour * 60;
  const endMinutes = config.endHour * 60;

  let addDays = 0;
  let targetMinutes = startMinutes;

  if (minutesNow < startMinutes) {
    targetMinutes = startMinutes;
  } else if (minutesNow >= endMinutes) {
    addDays = 1;
    targetMinutes = startMinutes;
  } else {
    const delta = minutesNow - startMinutes;
    targetMinutes =
      startMinutes +
      Math.ceil(delta / config.intervalMinutes) * config.intervalMinutes;
    if (targetMinutes >= endMinutes) {
      addDays = 1;
      targetMinutes = startMinutes;
    }
  }

  const localNoonUtc = new Date(
    Date.UTC(
      parts.year,
      (parts.month ?? 1) - 1,
      (parts.day ?? 1) + addDays,
      12,
      0,
      0,
    ),
  );
  const targetLocal = new Date(
    Date.UTC(
      localNoonUtc.getUTCFullYear(),
      localNoonUtc.getUTCMonth(),
      localNoonUtc.getUTCDate(),
      Math.floor(targetMinutes / 60),
      targetMinutes % 60,
      0,
    ),
  );

  const offsetPartsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: config.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const offsetParts = Object.fromEntries(
    offsetPartsFormatter
      .formatToParts(targetLocal)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const representedAsUtc = Date.UTC(
    offsetParts.year,
    (offsetParts.month ?? 1) - 1,
    offsetParts.day ?? 1,
    offsetParts.hour === 24 ? 0 : offsetParts.hour,
    offsetParts.minute ?? 0,
    offsetParts.second ?? 0,
  );
  const offsetMs = representedAsUtc - targetLocal.getTime();

  return new Date(targetLocal.getTime() - offsetMs);
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const candidate = await withDbRetry(() =>
      prisma.factoryVkVideoCandidate.findUnique({
        where: { id: body.candidateId },
        include: { group: true },
      }),
    );

    if (!candidate) {
      return NextResponse.json(
        { error: "VK-кандидат не найден" },
        { status: 404 },
      );
    }

    const account = await withDbRetry(() =>
      prisma.factoryAccount.findUnique({
        where: { id: body.accountId },
        select: { id: true, name: true, platform: true },
      }),
    );

    if (!account) {
      return NextResponse.json(
        { error: "Аккаунт публикации не найден" },
        { status: 404 },
      );
    }

    const resolvedTemplateId = await resolveTemplateId(body.templateId);
    const customTitle = (body.title || candidate.title)
      .replace(/\s+/g, " ")
      .trim();
    const description = (
      body.description ||
      buildRussianVkDescription({ sourceTitle: customTitle })
    ).trim();
    const titlePrefix = `VK_RU:${customTitle}`.slice(0, 100);
    const scheduleConfig = buildUploadScheduleConfig({
      publishMode: body.publishMode,
      windowStartHour: body.windowStartHour,
      windowEndHour: body.windowEndHour,
      intervalMinutes: body.intervalMinutes,
      timeZone: body.timeZone,
    });
    const firstScheduledAt = getFirstScheduledAt(scheduleConfig);

    const job = await withDbRetry(() =>
      prisma.factoryJob.create({
        data: {
          sourceUrl: candidate.sourceUrl,
          sourceFilePath: null,
          sourceStorageKey: null,
          sourceOriginalName: customTitle,
          sourceSizeBytes: null,
          clipSeconds: body.clipSeconds,
          titlePrefix,
          longVideoDescription: description,
          game: "OTHER",
          templateId: resolvedTemplateId,
          platforms: [account.platform],
          status: "QUEUED",
          totalClips: 0,
          progress: 0,
          progressLabel: scheduleConfig
            ? `VK Movie Smart: ${candidate.group?.name ?? "источник"} · ${body.clipsCount} нарезок · ${body.clipSeconds} сек · окно ${scheduleConfig.startHour}:00–${scheduleConfig.endHour}:00 / ${scheduleConfig.intervalMinutes} мин`
            : `VK Movie Smart: ${candidate.group?.name ?? "источник"} · ${body.clipsCount} нарезок · ${body.clipSeconds} сек`,
          publishTiming: scheduleConfig ? "USA_SMART" : "NOW",
          scheduledAt: firstScheduledAt,

          cutMode: "MOVIE_SMART",
          smartStepSeconds: 60,
          smartCandidates: 160,
          smartMinGapSeconds: 600,
          recommendation: scheduleConfig
            ? JSON.stringify({ uploadSchedule: scheduleConfig })
            : null,
          cancelRequested: false,
          targets: {
            create: {
              accountId: account.id,
              platform: account.platform,
              templateId: resolvedTemplateId,
              titlePrefix,
              maxClips: body.clipsCount,
            },
          },
        },
      }),
    );

    await withDbRetry(() =>
      prisma.factoryVkVideoCandidate.update({
        where: { id: candidate.id },
        data: {
          isUsed: true,
          usedAt: new Date(),
          createdJobId: job.id,
        },
      }),
    );

    return NextResponse.json({
      job,
      description,
      message: `Задача создана из VK-видео: ${candidate.title}`,
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
            : "Не получилось создать задачу из VK-видео",
      },
      { status: 500 },
    );
  }
}
