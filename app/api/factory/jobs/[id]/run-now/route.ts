import { NextResponse } from "next/server";

import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  const job = await prisma.factoryJob.findUnique({
    where: {
      id,
    },
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      cancelRequested: true,
    },
  });

  if (!job) {
    return NextResponse.json(
      {
        error: "Задача не найдена",
      },
      {
        status: 404,
      },
    );
  }

  if (["DONE", "FAILED", "CANCELED"].includes(job.status)) {
    return NextResponse.json(
      {
        error: "Эту задачу уже нельзя запустить вручную",
      },
      {
        status: 409,
      },
    );
  }

  if (job.status !== "QUEUED") {
    return NextResponse.json(
      {
        error: "Задача уже обрабатывается",
      },
      {
        status: 409,
      },
    );
  }

  if (job.cancelRequested) {
    return NextResponse.json(
      {
        error: "Задача уже стоит на отмену",
      },
      {
        status: 409,
      },
    );
  }

  const updatedJob = await prisma.factoryJob.update({
    where: {
      id,
    },
    data: {
      scheduledAt: null,
      progressLabel:
        job.scheduledAt === null
          ? "Задача уже готова к запуску"
          : "Запуск вручную: задача снята с расписания и готова к обработке",
    },
  });

  return NextResponse.json({
    job: updatedJob,
  });
}
