import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const templateSchema = z.object({
  name: z.string().min(1).max(80),
  assetId: z.string().min(1).optional().nullable(),
  lanaX: z.number().int().min(0).max(100),
  lanaY: z.number().int().min(0).max(100),
  lanaWidth: z.number().int().min(120).max(1080),
  lanaHeight: z.number().int().min(120).max(1920),
  mirrorLana: z.boolean(),
  kind: z.enum(["SHORTS_9_16", "LONG_16_9"]).default("SHORTS_9_16"),
  facecamPosition: z.enum(["TOP_LEFT", "TOP_RIGHT", "BOTTOM_LEFT", "BOTTOM_RIGHT"]).default("TOP_LEFT"),
  facecamWidthPercent: z.number().int().min(12).max(40).default(24),
  facecamMarginPercent: z.number().int().min(1).max(10).default(3),
  facecamBorderRadius: z.number().int().min(0).max(64).default(18),
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
    include: {
      asset: true,
    },
  });

  return NextResponse.json({
    templates,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = templateSchema.parse(body);

    if (data.assetId) {
      const asset = await prisma.factoryAsset.findUnique({
        where: {
          id: data.assetId,
        },
      });

      if (!asset) {
        return NextResponse.json(
          {
            error: "Видео персонажа для шаблона не найдено",
          },
          {
            status: 400,
          },
        );
      }
    }

    if (data.isDefault) {
      await prisma.factoryTemplate.updateMany({
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.factoryTemplate.create({
      data: {
        name: data.name,
        assetId: data.assetId || null,
        lanaX: data.lanaX,
        lanaY: data.lanaY,
        lanaWidth: data.lanaWidth,
        lanaHeight: data.lanaHeight,
        mirrorLana: data.mirrorLana,
        kind: data.kind,
        facecamPosition: data.facecamPosition,
        facecamWidthPercent: data.facecamWidthPercent,
        facecamMarginPercent: data.facecamMarginPercent,
        facecamBorderRadius: data.facecamBorderRadius,
        isDefault: data.isDefault,
      },
      include: {
        asset: true,
      },
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
