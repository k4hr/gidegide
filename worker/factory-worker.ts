import path from "node:path";
import { mkdir, rm } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import {
  FACTORY_LANA_DIR,
  FACTORY_SOURCE_DIR,
} from "@/lib/factory/paths";
import {
  downloadYoutubeSource,
  getSourceDuration,
  renderFactoryClip,
} from "@/lib/factory/render";
import { uploadYoutubeShort } from "@/lib/factory/youtube";
import {
  downloadR2ObjectToFile,
  getR2Prefix,
  isR2Enabled,
  uploadFileToR2,
} from "@/lib/factory/r2";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

async function updateJobProgress(jobId: string, progress: number, label: string) {
  await prisma.factoryJob.update({
    where: {
      id: jobId,
    },
    data: {
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      progressLabel: label,
    },
  });
}

async function isJobCanceled(jobId: string) {
  const job = await prisma.factoryJob.findUnique({
    where: {
      id: jobId,
    },
    select: {
      cancelRequested: true,
      status: true,
    },
  });

  return Boolean(job?.cancelRequested || job?.status === "CANCELED");
}

async function assertNotCanceled(jobId: string) {
  const canceled = await isJobCanceled(jobId);

  if (canceled) {
    throw new Error("Задача отменена пользователем");
  }
}

async function markJobCanceled(jobId: string) {
  await prisma.factoryJob.update({
    where: {
      id: jobId,
    },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
      progressLabel: "Задача отменена",
    },
  });

  await prisma.factoryPublish.updateMany({
    where: {
      clip: {
        jobId,
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

async function ensureLocalLanaFile(input: {
  assetId: string;
  filePath: string;
  storageKey: string | null;
}) {
  if (!isR2Enabled() || !input.storageKey) {
    return input.filePath;
  }

  await mkdir(FACTORY_LANA_DIR, { recursive: true });

  const localPath = path.join(FACTORY_LANA_DIR, `${input.assetId}.mp4`);

  await downloadR2ObjectToFile({
    key: input.storageKey,
    filePath: localPath,
  });

  return localPath;
}

async function processOneJob() {
  const job = await prisma.factoryJob.findFirst({
    where: {
      status: "QUEUED",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!job) {
    return false;
  }

  console.log(`Processing job ${job.id}`);

  let sourcePath: string | null = null;

  try {
    const lanaVideos = await prisma.factoryAsset.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });

    if (lanaVideos.length === 0) {
      throw new Error("Нет загруженных видео Ланы");
    }

    await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "DOWNLOADING",
        error: null,
        progress: 1,
        progressLabel: "Подготовка скачивания",
      },
    });

    sourcePath = await downloadYoutubeSource({
      jobId: job.id,
      sourceUrl: job.sourceUrl,
      isCanceled: () => isJobCanceled(job.id),
      onProgress: (progress, label) =>
        updateJobProgress(job.id, progress, label),
    });

    await assertNotCanceled(job.id);

    const duration = await getSourceDuration(sourcePath);

    const maxClips = Number(process.env.FACTORY_MAX_CLIPS_PER_JOB ?? 40);
    const clipStarts: number[] = [];

    for (
      let startSec = 0;
      startSec + job.clipSeconds <= duration && clipStarts.length < maxClips;
      startSec += job.clipSeconds
    ) {
      clipStarts.push(startSec);
    }

    await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "RENDERING",
        totalClips: clipStarts.length,
        progress: 30,
        progressLabel: `Найдено клипов: ${clipStarts.length}`,
      },
    });

    for (let i = 0; i < clipStarts.length; i += 1) {
      await assertNotCanceled(job.id);

      const clipIndex = i + 1;
      const startSec = clipStarts[i];
      const endSec = startSec + job.clipSeconds;
      const title = `${job.titlePrefix} #${clipIndex}`;

      const renderProgress = 30 + Math.round((i / Math.max(1, clipStarts.length)) * 45);

      await updateJobProgress(
        job.id,
        renderProgress,
        `Рендер клипа ${clipIndex}/${clipStarts.length}`,
      );

      const clip = await prisma.factoryClip.create({
        data: {
          jobId: job.id,
          index: clipIndex,
          startSec,
          endSec,
          title,
        },
      });

      const lanaAsset = randomItem(lanaVideos);

      const lanaPath = await ensureLocalLanaFile({
        assetId: lanaAsset.id,
        filePath: lanaAsset.filePath,
        storageKey: lanaAsset.storageKey,
      });

      const outputPath = await renderFactoryClip({
        jobId: job.id,
        clipIndex,
        sourcePath,
        lanaPath,
        startSec,
        clipSeconds: job.clipSeconds,
        isCanceled: () => isJobCanceled(job.id),
      });

      await assertNotCanceled(job.id);

      const storageKey = `${getR2Prefix()}/jobs/${job.id}/clips/${String(
        clipIndex,
      ).padStart(4, "0")}.mp4`;

      const uploadedKey = await uploadFileToR2({
        key: storageKey,
        filePath: outputPath,
        contentType: "video/mp4",
      });

      await prisma.factoryClip.update({
        where: {
          id: clip.id,
        },
        data: {
          filePath: outputPath,
          storageKey: uploadedKey,
        },
      });

      await prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "PUBLISHING",
          progress: 75 + Math.round((i / Math.max(1, clipStarts.length)) * 20),
          progressLabel: `Публикация клипа ${clipIndex}/${clipStarts.length}`,
        },
      });

      for (const platform of job.platforms) {
        await assertNotCanceled(job.id);

        const publish = await prisma.factoryPublish.create({
          data: {
            clipId: clip.id,
            platform,
            status: "QUEUED",
          },
        });

        if (platform === "YOUTUBE") {
          await prisma.factoryPublish.update({
            where: {
              id: publish.id,
            },
            data: {
              status: "UPLOADING",
            },
          });

          try {
            const result = await uploadYoutubeShort({
              filePath: outputPath,
              title,
              description: "Lana watches gaming clips. #shorts #gaming #games",
            });

            await prisma.factoryPublish.update({
              where: {
                id: publish.id,
              },
              data: {
                status: "PUBLISHED",
                platformPostId: result.id,
                platformUrl: result.url,
              },
            });
          } catch (error) {
            await prisma.factoryPublish.update({
              where: {
                id: publish.id,
              },
              data: {
                status: "FAILED",
                error:
                  error instanceof Error
                    ? error.message
                    : "YouTube upload failed",
              },
            });
          }
        }

        if (platform === "TIKTOK") {
          await prisma.factoryPublish.update({
            where: {
              id: publish.id,
            },
            data: {
              status: "SKIPPED",
              error: "TikTok uploader добавим следующим шагом",
            },
          });
        }
      }

      await rm(outputPath, { force: true });
    }

    await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "DONE",
        progress: 100,
        progressLabel: "Готово",
      },
    });

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    console.log(`Job ${job.id} done`);
    return true;
  } catch (error) {
    console.error(error);

    const isCanceledError =
      error instanceof Error &&
      error.message.toLowerCase().includes("отмен");

    if (isCanceledError) {
      await markJobCanceled(job.id);
    } else {
      await prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
          progressLabel: "Ошибка",
        },
      });
    }

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    return true;
  }
}

async function resetInterruptedJobs() {
  await prisma.factoryJob.updateMany({
    where: {
      status: {
        in: ["DOWNLOADING", "RENDERING", "PUBLISHING"],
      },
    },
    data: {
      status: "QUEUED",
      progressLabel: "Задача восстановлена после перезапуска worker",
    },
  });
}

async function main() {
  console.log("Factory worker started");

  await mkdir(FACTORY_SOURCE_DIR, { recursive: true });
  await resetInterruptedJobs();

  while (true) {
    const processed = await processOneJob();

    if (!processed) {
      await sleep(5000);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
