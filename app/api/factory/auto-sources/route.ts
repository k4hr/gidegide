import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { DEFAULT_VK_AUTO_SOURCE_TIMEZONE, normalizeVkAutoSourceTimezone, normalizeVkSourceUrl } from "@/lib/factory/vk-auto-source";
import { getVkDownloadProviderConfig } from "@/lib/factory/vk-download-provider";

export const runtime = "nodejs";

const createSchema = z.object({
  sourceUrl: z.string().url(),
  sourceTitle: z.string().trim().max(200).optional(),
  chatId: z.string().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(20).default(10),
  publishStartHour: z.coerce.number().int().min(0).max(23).default(15),
  publishEndHour: z.coerce.number().int().min(1).max(24).default(23),
  timezone: z.string().trim().min(1).max(80).default(DEFAULT_VK_AUTO_SOURCE_TIMEZONE),
});

export async function GET() {
  await prisma.factoryVkAutoSource.updateMany({
    where: { timezone: "Europe/Moscow" },
    data: { timezone: DEFAULT_VK_AUTO_SOURCE_TIMEZONE },
  });
  const sources = await prisma.factoryVkAutoSource.findMany({
    orderBy: { createdAt: "desc" },
    include: { chat: { select: { chatId: true, username: true } }, runs: { orderBy: { startedAt: "desc" }, take: 1 }, _count: { select: { videos: true } } },
  });
  return NextResponse.json({ sources, downloader: getVkDownloadProviderConfig() });
}

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const chat = body.chatId
      ? await prisma.factoryTelegramChat.findUnique({ where: { chatId: body.chatId } })
      : await prisma.factoryTelegramChat.findFirst({ where: { isAllowed: true }, orderBy: { createdAt: "asc" } });
    if (!chat?.isAllowed) return NextResponse.json({ error: "РќРµС‚ СЂР°Р·СЂРµС€С‘РЅРЅРѕРіРѕ Telegram chatId" }, { status: 400 });
    if (body.publishEndHour <= body.publishStartHour) return NextResponse.json({ error: "РљРѕРЅРµС† РѕРєРЅР° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїРѕР·Р¶Рµ РЅР°С‡Р°Р»Р°" }, { status: 400 });
    const sourceUrl = normalizeVkSourceUrl(body.sourceUrl);
    const timezone = normalizeVkAutoSourceTimezone(body.timezone);
    const source = await prisma.factoryVkAutoSource.upsert({
      where: { chatId_sourceUrl: { chatId: chat.id, sourceUrl } },
      create: { chatId: chat.id, sourceUrl, sourceTitle: body.sourceTitle || null, dailyLimit: body.dailyLimit, publishStartHour: body.publishStartHour, publishEndHour: body.publishEndHour, timezone },
      update: { sourceTitle: body.sourceTitle || undefined, dailyLimit: body.dailyLimit, publishStartHour: body.publishStartHour, publishEndHour: body.publishEndHour, timezone, isEnabled: true },
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "РќРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РґР°РЅРЅС‹Рµ" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РёСЃС‚РѕС‡РЅРёРє" }, { status: 500 });
  }
}
