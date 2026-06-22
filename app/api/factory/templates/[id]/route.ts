import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  assetId: z.string().min(1).optional().nullable(),
  lanaX: z.number().int().min(0).max(100).optional(),
  lanaY: z.number().int().min(0).max(100).optional(),
  lanaWidth: z.number().int().min(120).max(760).optional(),
  lanaHeight: z.number().int().min(120).max(1200).optional(),
  mirrorLana: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const data = updateTemplateSchema.parse(body);

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
        where: {
          id: {
            not: id,
          },
        },
        data: {
          isDefault: false,
        },
      });
    }

    const template = await prisma.factoryTemplate.update({
      where: {
        id,
      },
      data,
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
          error instanceof Error ? error.message : "Не получилось обновить шаблон",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  await prisma.factoryTemplate.delete({
    where: {
      id,
    },
  });

  return NextResponse.json({
    ok: true,
  });
}
