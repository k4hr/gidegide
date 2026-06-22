import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import { deleteR2Object } from "../../../../../lib/factory/r2";
import { withDbRetry } from "../../../../../lib/factory/db-retry";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      isActive?: boolean;
    };

    const thumbnail = await withDbRetry(() =>
      prisma.factoryThumbnail.update({
        where: {
          id,
        },
        data: {
          isActive: Boolean(body.isActive),
        },
      }),
    );

    return NextResponse.json({
      thumbnail,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось обновить превью",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    const thumbnail = await withDbRetry(() =>
      prisma.factoryThumbnail.findUnique({
        where: {
          id,
        },
      }),
    );

    if (!thumbnail) {
      return NextResponse.json(
        {
          error: "Превью не найдено",
        },
        {
          status: 404,
        },
      );
    }

    await withDbRetry(() =>
      prisma.factoryThumbnail.delete({
        where: {
          id,
        },
      }),
    );

    await rm(thumbnail.filePath, {
      force: true,
    });

    await deleteR2Object(thumbnail.storageKey);

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось удалить превью",
      },
      {
        status: 500,
      },
    );
  }
}
