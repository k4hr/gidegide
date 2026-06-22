import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const asset = await prisma.factoryAsset.findUnique({
      where: {
        id,
      },
    });

    if (!asset) {
      return NextResponse.json(
        {
          error: "Видео не найдено",
        },
        {
          status: 404,
        },
      );
    }

    await prisma.factoryTemplate.updateMany({
      where: {
        assetId: id,
      },
      data: {
        assetId: null,
      },
    });

    await prisma.factoryAsset.delete({
      where: {
        id,
      },
    });

    if (asset.filePath) {
      await rm(asset.filePath, {
        force: true,
      });
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось удалить видео",
      },
      {
        status: 500,
      },
    );
  }
}
