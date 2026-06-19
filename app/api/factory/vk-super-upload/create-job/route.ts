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
  publishNow: z.boolean().default(true),
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
      return NextResponse.json({ error: "VK-кандидат не найден" }, { status: 404 });
    }

    const account = await withDbRetry(() =>
      prisma.factoryAccount.findUnique({
        where: { id: body.accountId },
        select: { id: true, name: true, platform: true },
      }),
    );

    if (!account) {
      return NextResponse.json({ error: "Аккаунт публикации не найден" }, { status: 404 });
    }

    const resolvedTemplateId = await resolveTemplateId(body.templateId);
    const titlePrefix = `VK_RU:${candidate.title}`.slice(0, 80);
    const description = buildRussianVkDescription({ sourceTitle: candidate.title });

    const job = await withDbRetry(() =>
      prisma.factoryJob.create({
        data: {
          sourceUrl: candidate.sourceUrl,
          sourceFilePath: null,
          sourceStorageKey: null,
          sourceOriginalName: candidate.title,
          sourceSizeBytes: null,
          clipSeconds: body.clipSeconds,
          titlePrefix,
          game: "OTHER",
          templateId: resolvedTemplateId,
          platforms: [account.platform],
          status: "QUEUED",
          totalClips: 0,
          progress: 0,
          progressLabel: `VK Movie Smart: ${candidate.group?.name ?? "источник"} · ${body.clipsCount} нарезок · ${body.clipSeconds} сек`,
          publishTiming: "NOW",
          scheduledAt: body.publishNow ? null : new Date(),
          cutMode: "MOVIE_SMART",
          smartStepSeconds: 60,
          smartCandidates: 160,
          smartMinGapSeconds: 600,
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
