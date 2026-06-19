import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const patchSchema = z.object({
  sourceTitle: z.string().trim().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(20).optional(),
  publishStartHour: z.coerce.number().int().min(0).max(23).optional(),
  publishEndHour: z.coerce.number().int().min(1).max(24).optional(),
  timezone: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const data = patchSchema.parse(await request.json());
    const current = await prisma.factoryVkAutoSource.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Источник не найден" }, { status: 404 });
    const start = data.publishStartHour ?? current.publishStartHour;
    const end = data.publishEndHour ?? current.publishEndHour;
    if (end <= start) return NextResponse.json({ error: "Конец окна должен быть позже начала" }, { status: 400 });
    const source = await prisma.factoryVkAutoSource.update({ where: { id }, data });
    return NextResponse.json({ source });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Некорректные данные" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не удалось обновить источник" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { id } = await context.params;
  const found = await prisma.factoryVkAutoSource.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Источник не найден" }, { status: 404 });
  await prisma.factoryVkAutoSource.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
