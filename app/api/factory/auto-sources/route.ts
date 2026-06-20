import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { normalizeVkAutoSourceTimezone, normalizeVkSourceUrl } from "@/lib/factory/vk-auto-source";
import { getVkDownloadProviderConfig } from "@/lib/factory/vk-download-provider";
import { getVkCookiesStatus } from "@/lib/factory/vk-cookies";

export const runtime = "nodejs";

const createSchema = z.object({
  sourceUrl: z.string().url(),
  sourceTitle: z.string().trim().max(200).optional(),
  chatId: z.string().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(20).default(10),
  publishStartHour: z.coerce.number().int().min(0).max(23).default(15),
  publishEndHour: z.coerce.number().int().min(1).max(24).default(23),
  timezone: z.string().trim().min(1).max(80).default("Europe/Moscow"),
});

export async function GET() {
  const vkCookies = await getVkCookiesStatus();
  const sources = await prisma.factoryVkAutoSource.findMany({
    orderBy: { createdAt: "desc" },
    include: { chat: { select: { chatId: true, username: true } }, runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { videos: true } } },
  });
  return NextResponse.json({ sources, downloader: getVkDownloadProviderConfig(), vkCookies });
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    body.timezone = normalizeVkAutoSourceTimezone(body.timezone);
    const chat = body.chatId
      ? await prisma.factoryTelegramChat.findUnique({ where: { chatId: body.chatId } })
      : await prisma.factoryTelegramChat.findFirst({ where: { isAllowed: true }, orderBy: { createdAt: "asc" } });
    if (!chat?.isAllowed) return NextResponse.json({ error: "Нет разрешённого Telegram chatId" }, { status: 400 });
    if (body.publishEndHour <= body.publishStartHour) return NextResponse.json({ error: "Конец окна должен быть позже начала" }, { status: 400 });
    const sourceUrl = normalizeVkSourceUrl(body.sourceUrl);
    const source = await prisma.factoryVkAutoSource.upsert({
      where: { chatId_sourceUrl: { chatId: chat.id, sourceUrl } },
      create: { chatId: chat.id, sourceUrl, sourceTitle: body.sourceTitle || null, dailyLimit: body.dailyLimit, publishStartHour: body.publishStartHour, publishEndHour: body.publishEndHour, timezone: body.timezone },
      update: { sourceTitle: body.sourceTitle || undefined, dailyLimit: body.dailyLimit, publishStartHour: body.publishStartHour, publishEndHour: body.publishEndHour, timezone: body.timezone, isEnabled: true },
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Некорректные данные" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось добавить источник" }, { status: 500 });
  }
}
