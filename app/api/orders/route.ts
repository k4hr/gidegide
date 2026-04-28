import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const createOrderSchema = z.object({
  slug: z.enum(["instagram", "tiktok", "youtube-shorts"]),
  email: z.string().email("Введите корректный email"),
});

function createAccessToken() {
  return randomBytes(32).toString("hex");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createOrderSchema.parse(body);

    const lesson = await prisma.lesson.findFirst({
      where: {
        slug: data.slug,
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (!lesson) {
      return NextResponse.json(
        {
          error: "Урок не найден",
        },
        {
          status: 404,
        },
      );
    }

    const order = await prisma.order.create({
      data: {
        email: data.email.toLowerCase().trim(),
        lessonId: lesson.id,
        accessToken: createAccessToken(),

        /**
         * MVP-заглушка оплаты:
         * сейчас сразу ставим PAID, чтобы проверить весь путь.
         *
         * Когда подключим оплату:
         * status: "PENDING"
         * paidAt: null
         *
         * А после webhook от платежки будем обновлять:
         * status: "PAID"
         * paidAt: new Date()
         */
        status: "PAID",
        paidAt: new Date(),
      },
      select: {
        accessToken: true,
      },
    });

    return NextResponse.json({
      accessUrl: `/access/${order.accessToken}`,
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
        error: "Не получилось создать заказ",
      },
      {
        status: 500,
      },
    );
  }
}
