import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";
import { withDbRetry } from "../../../../../lib/factory/db-retry";

export const runtime = "nodejs";

const bodySchema = z.object({
  id: z.string().min(1),
  isUsed: z.boolean().default(true),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());

    const video = await withDbRetry(() =>
      prisma.factorySourceVideo.update({
        where: {
          id: body.id,
        },
        data: {
          isUsed: body.isUsed,
          usedAt: body.isUsed ? new Date() : null,
        },
      }),
    );

    return NextResponse.json({
      video,
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
          error instanceof Error
            ? error.message
            : "Не получилось обновить source video",
      },
      {
        status: 500,
      },
    );
  }
}
