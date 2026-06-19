import { prisma } from "@/lib/prisma";

export async function cancelFactoryJob(id: string) {
  const job = await prisma.factoryJob.findUnique({ where: { id } });
  if (!job) return null;
  if (["DONE", "FAILED", "CANCELED"].includes(job.status)) return job;

  const queued = job.status === "QUEUED";
  const updated = await prisma.factoryJob.update({
    where: { id },
    data: queued
      ? { status: "CANCELED", cancelRequested: true, canceledAt: new Date(), progressLabel: "Задача отменена" }
      : { cancelRequested: true, progressLabel: "Отмена запрошена" },
  });
  if (queued) {
    await prisma.factoryPublish.updateMany({
      where: { clip: { jobId: id }, status: { in: ["QUEUED", "UPLOADING"] } },
      data: { status: "CANCELED", error: "Задача отменена пользователем" },
    });
  }
  return updated;
}
