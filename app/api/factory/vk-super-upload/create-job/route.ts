import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createVkMovieJob } from "@/lib/factory/create-vk-movie-job";

export const runtime = "nodejs";

const bodySchema = z.object({
  candidateId: z.string().min(1),
  accountId: z.string().min(1),
  templateId: z.string().min(1).default("CENTER_VIDEO"),
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
  if (templateId === "CENTER_VIDEO") return null;
  if (templateId === "RANDOM") {
    const template = await prisma.factoryTemplate.findFirst({
      where: { assetId: { not: null } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!template) throw new Error("Нет доступного шаблона");
    return template.id;
  }
  return templateId;
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const candidate = await prisma.factoryVkVideoCandidate.findUnique({
      where: { id: body.candidateId },
      include: { group: true },
    });
    if (!candidate) return NextResponse.json({ error: "VK-кандидат не найден" }, { status: 404 });

    const job = await createVkMovieJob({
      sourceUrl: candidate.sourceUrl,
      movieTitle: body.title || candidate.title,
      description: body.description,
      accountId: body.accountId,
      templateId: await resolveTemplateId(body.templateId),
      clipCount: body.clipsCount,
      clipSeconds: body.clipSeconds,
      scheduleMode: body.publishMode,
      scheduleStartHour: body.windowStartHour,
      scheduleEndHour: body.windowEndHour,
      scheduleIntervalMinutes: body.intervalMinutes,
      timeZone: body.timeZone,
    });

    await prisma.factoryVkVideoCandidate.update({
      where: { id: candidate.id },
      data: { isUsed: true, usedAt: new Date(), createdJobId: job.id },
    });
    return NextResponse.json({
      job,
      description: body.description || null,
      message: `Задача создана из VK-видео: ${candidate.title}. AI сгенерирует названия при обработке.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Некорректные данные" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не получилось создать задачу" }, { status: 500 });
  }
}
