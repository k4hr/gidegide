import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({
      job,
    });
  }

  const updatedJob = await prisma.factoryJob.update({
    where: {
      id,
    },
    data:
      job.status === "QUEUED"
        ? {
            status: "CANCELED",
            cancelRequested: true,
            canceledAt: new Date(),
            progressLabel: "Задача отменена",
          }
        : {
            cancelRequested: true,
            progressLabel: "Отмена запрошена",
          },
  });

  if (job.status === "QUEUED") {
    await prisma.factoryPublish.updateMany({
      where: {
        clip: {
          jobId: id,
        },
        status: {
          in: ["QUEUED", "UPLOADING"],
        },
      },
      data: {
        status: "CANCELED",
        error: "Задача отменена пользователем",
      },
    });
  }

  return NextResponse.json({
    job: updatedJob,
  });
}
