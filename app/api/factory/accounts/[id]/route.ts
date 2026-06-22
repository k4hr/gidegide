import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const updateAccountSchema = z.object({
  name: z.string().min(1, "Название не может быть пустым").max(80),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const data = updateAccountSchema.parse(body);

    const account = await prisma.factoryAccount.update({
      where: {
        id,
      },
      data: {
        name: data.name.trim(),
      },
      select: {
        id: true,
        platform: true,
        name: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      account,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректное название",
        },
        {
          status: 400,
        },
      );
    }

    const message =
      error instanceof Error ? error.message : "Не получилось обновить аккаунт";

    if (message.includes("Unique constraint")) {
      return NextResponse.json(
        {
          error: "Аккаунт с таким названием уже есть",
        },
        {
          status: 400,
        },
      );
    }

    return NextResponse.json(
      {
        error: message,
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

    await prisma.factoryAccount.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось удалить аккаунт",
      },
      {
        status: 500,
      },
    );
  }
}
