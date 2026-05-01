import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const templateSchema = z.object({
  name: z.string().min(1).max(80),
  lanaX: z.number().int().min(0).max(100),
  lanaY: z.number().int().min(0).max(100),
  lanaWidth: z.number().int().min(120).max(760),
  lanaHeight: z.number().int().min(120).max(1200),
  mirrorLana: z.boolean(),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  const templates = await prisma.factoryTemplate.findMany({
    orderBy: [
      {
        isDefault: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  return NextResponse.json({
    templates,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = templateSchema.parse(body);

    if (data.isDefault) {
      await prisma.factoryTemplate.updateMany({
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.factoryTemplate.create({
      data,
    });

    return NextResponse.json({
      template,
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

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось сохранить шаблон",
      },
      {
        status: 500,
      },
    );
  }
}
