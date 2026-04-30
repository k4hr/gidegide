import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createJobSchema = z.object({
  sourceUrl: z.string().url(),
  clipSeconds: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  titlePrefix: z.string().min(1).max(80).default("Lana watches games"),
  platforms: z
    .array(z.enum(["YOUTUBE", "TIKTOK"]))
    .min(1)
    .default(["YOUTUBE"]),
});

export async function GET() {
  const jobs = await prisma.factoryJob.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
    include: {
      clips: {
        orderBy: {
          index: "asc",
        },
        include: {
          publishes: true,
        },
      },
    },
  });

  return NextResponse.json({
    jobs,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data = createJobSchema.parse(body);

    const job = await prisma.factoryJob.create({
      data: {
        sourceUrl: data.sourceUrl,
        clipSeconds: data.clipSeconds,
        titlePrefix: data.titlePrefix,
        platforms: data.platforms,
      },
    });

    return NextResponse.json({
      job,
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
        error: error instanceof Error ? error.message : "Не получилось создать задачу",
      },
      {
        status: 500,
      },
    );
  }
}
