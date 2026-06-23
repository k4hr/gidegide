import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";
import { addInstagramAutoSource, listInstagramAutoSources } from "../../../../lib/factory/instagram-auto-source";

const postSchema = z.object({
  chatId: z.string().optional().default("web"),
  sourceUrl: z.string().min(2),
});

export async function GET() {
  const sources = await listInstagramAutoSources();
  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  const body = postSchema.parse(await request.json());
  await prisma.factoryTelegramChat.upsert({
    where: { chatId: body.chatId },
    create: { chatId: body.chatId, isAllowed: true },
    update: {},
  });
  const source = await addInstagramAutoSource({ chatId: body.chatId, sourceUrl: body.sourceUrl });
  return NextResponse.json({ source });
}
