import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { analyzeViralReference, rebuildViralBrainSnapshot } from "@/lib/factory/viral-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; limit?: number };
    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 20)));

    const references = body.id
      ? await withDbRetry(() => prisma.viralReference.findMany({ where: { id: body.id }, take: 1 }))
      : await withDbRetry(() =>
          prisma.viralReference.findMany({
            where: { niche: "ROBLOX", status: { in: ["UPLOADED", "QUEUED", "FAILED"] }, filePath: { not: null } },
            orderBy: { createdAt: "asc" },
            take: limit,
          }),
        );

    if (references.length === 0) {
      return NextResponse.json({ message: "Нет локальных референсов для анализа", analyzed: 0, errors: [] });
    }

    let analyzed = 0;
    const errors: Array<{ id: string; title: string | null; error: string }> = [];

    for (const reference of references) {
      try {
        await analyzeViralReference(reference.id);
        analyzed += 1;
      } catch (error) {
        errors.push({
          id: reference.id,
          title: reference.title,
          error: error instanceof Error ? error.message : "Ошибка анализа",
        });
      }
    }

    await rebuildViralBrainSnapshot("ROBLOX").catch(() => null);

    return NextResponse.json({
      analyzed,
      errors,
      message: `Анализ завершен: ${analyzed}/${references.length}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка анализа" }, { status: 500 });
  }
}
