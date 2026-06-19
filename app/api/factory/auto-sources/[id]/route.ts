import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { normalizeVkAutoSourceTimezone } from "@/lib/factory/vk-auto-source";
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
