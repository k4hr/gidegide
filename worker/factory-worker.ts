import fs from "node:fs";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import { FACTORY_LANA_DIR, FACTORY_SOURCE_DIR } from "@/lib/factory/paths";
import {
  downloadSourceFromUrl,
  getSourceDuration,
  renderFactoryClip,
  type FactoryRenderTemplate,
} from "@/lib/factory/render";
import { uploadYoutubeShort } from "@/lib/factory/youtube";
import { uploadTikTokDraft } from "@/lib/factory/tiktok";
import {
  downloadR2ObjectToFile,
  getR2Prefix,
  isR2Enabled,
  uploadFileToR2,
} from "@/lib/factory/r2";
import { buildClipDescription, buildClipTitle } from "@/lib/factory/games";
import { withDbRetry } from "@/lib/factory/db-retry";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function db<T>(operation: () => Promise<T>) {
  return withDbRetry(operation, 5);
}

async function safeDb<T>(operation: () => Promise<T>) {
  try {
    return await db(operation);
  } catch (error) {
    console.error("Database operation failed after retries:", error);
    return null;
  }
}

async function updateJobProgress(jobId: string, progress: number, label: string) {
  await db(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        progressLabel: label,
      },
    }),
  );
}

async function isJobCanceled(jobId: string) {
  const job = await db(() =>
    prisma.factoryJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        cancelRequested: true,
        status: true,
      },
    }),
  );

  return Boolean(job?.cancelRequested || job?.status === "CANCELED");
}

async function assertNotCanceled(jobId: string) {
  const canceled = await isJobCanceled(jobId);

  if (canceled) {
    throw new Error("Задача отменена пользователем");
  }
}

async function markJobCanceled(jobId: string) {
  await safeDb(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        progressLabel: "Задача отменена",
      },
    }),
  );

  await safeDb(() =>
    prisma.factoryPublish.updateMany({
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
    }),
  );
}

async function markJobFailed(jobId: string, error: unknown) {
  await safeDb(() =>
    prisma.factoryJob.update({
      where: {
        id: jobId,
      },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
        progressLabel: "Ошибка",
      },
    }),
  );
}

async function ensureLocalSourceFile(job: {
  id: string;
  sourceUrl: string | null;
  sourceFilePath: string | null;
  sourceStorageKey: string | null;
}) {
  if (job.sourceFilePath && fs.existsSync(job.sourceFilePath)) {
    await updateJobProgress(job.id, 5, "Использую загруженный MP4");
    return job.sourceFilePath;
  }

  if (job.sourceStorageKey && isR2Enabled()) {
    await updateJobProgress(job.id, 5, "Скачиваю исходный MP4 из R2");

    const localPath = path.join(FACTORY_SOURCE_DIR, `${job.id}-source.mp4`);

    await downloadR2ObjectToFile({
      key: job.sourceStorageKey,
      filePath: localPath,
    });

    await updateJobProgress(job.id, 30, "Исходный MP4 готов");

    return localPath;
  }

  if (job.sourceUrl) {
    return downloadSourceFromUrl({
      jobId: job.id,
      sourceUrl: job.sourceUrl,
      isCanceled: () => isJobCanceled(job.id),
      onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
    });
  }

  throw new Error("У задачи нет исходного MP4 и нет YouTube-ссылки");
}

function getDefaultTemplate(): FactoryRenderTemplate {
  return {
    lanaX: 78,
    lanaY: 68,
    lanaWidth: 300,
    lanaHeight: 533,
    mirrorLana: false,
  };
}

function getTargetTemplate(target: {
  template: {
    lanaX: number;
    lanaY: number;
    lanaWidth: number;
    lanaHeight: number;
    mirrorLana: boolean;
  } | null;
}): FactoryRenderTemplate {
  if (!target.template) {
    return getDefaultTemplate();
  }

  return {
    lanaX: target.template.lanaX,
    lanaY: target.template.lanaY,
    lanaWidth: target.template.lanaWidth,
    lanaHeight: target.template.lanaHeight,
    mirrorLana: target.template.mirrorLana,
  };
}

async function ensureLocalTemplateAssetFile(target: {
  template: {
    name: string;
    asset: {
      id: string;
      filePath: string;
      storageKey: string | null;
      title: string;
    } | null;
  } | null;
}) {
  const template = target.template;

  if (!template) {
    throw new Error(
      "У выбранного аккаунта не выбран шаблон. Выбери шаблон на странице /factory.",
    );
  }

  const asset = template.asset;

  if (!asset) {
    throw new Error(
      `У шаблона "${template.name}" не выбрано видео персонажа. Открой /factory/templates и привяжи видео к шаблону.`,
    );
  }

  if (fs.existsSync(asset.filePath)) {
    return asset.filePath;
  }

  if (!isR2Enabled() || !asset.storageKey) {
    throw new Error(
      `Видео "${asset.title}" из шаблона "${template.name}" не найдено локально и не сохранено в R2.`,
    );
  }

  await mkdir(FACTORY_LANA_DIR, { recursive: true });

  const localPath = path.join(FACTORY_LANA_DIR, `${asset.id}.mp4`);

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  await downloadR2ObjectToFile({
    key: asset.storageKey,
    filePath: localPath,
  });

  return localPath;
}

async function processOneJob() {
  const job = await db(() =>
    prisma.factoryJob.findFirst({
      where: {
        status: "QUEUED",
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        targets: {
          include: {
            account: true,
            template: {
              include: {
                asset: true,
              },
            },
          },
        },
      },
    }),
  );

  if (!job) {
    return false;
  }

  console.log(`Processing job ${job.id}`);

  let sourcePath: string | null = null;

  try {
    const targets = job.targets;

    if (targets.length === 0) {
      throw new Error("У задачи нет выбранных аккаунтов публикации");
    }

    for (const target of targets) {
      if (!target.template) {
        throw new Error(
          `Для аккаунта "${target.account.name}" не выбран шаблон.`,
        );
      }

      if (!target.template.asset) {
        throw new Error(
          `Для шаблона "${target.template.name}" не выбрано видео персонажа.`,
        );
      }
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "DOWNLOADING",
          error: null,
          progress: 1,
          progressLabel: "Подготовка исходника",
        },
      }),
    );

    sourcePath = await ensureLocalSourceFile(job);

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

    if (clipStarts.length === 0) {
      throw new Error("Видео слишком короткое для выбранной длины клипа");
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "RENDERING",
          totalClips: clipStarts.length,
          progress: 30,
          progressLabel: `Найдено клипов: ${clipStarts.length}`,
        },
      }),
    );

    const totalRenders = clipStarts.length * targets.length;
    let completedRenders = 0;

    for (let i = 0; i < clipStarts.length; i += 1) {
      await assertNotCanceled(job.id);

      const clipIndex = i + 1;
      const startSec = clipStarts[i];
      const endSec = startSec + job.clipSeconds;

      const baseTitle = buildClipTitle({
        game: job.game,
        clipIndex,
        customPrefix: job.titlePrefix,
      });

      const clip = await db(() =>
        prisma.factoryClip.create({
          data: {
            jobId: job.id,
            index: clipIndex,
            startSec,
            endSec,
            title: baseTitle,
          },
        }),
      );

      for (const target of targets) {
        await assertNotCanceled(job.id);

        const titlePrefixForTarget = target.titlePrefix || job.titlePrefix;

        const title = buildClipTitle({
          game: job.game,
          clipIndex,
          customPrefix: titlePrefixForTarget,
        });

        const description = buildClipDescription({
          game: job.game,
          customPrefix: titlePrefixForTarget,
        });

        const renderProgress =
          30 + Math.round((completedRenders / Math.max(1, totalRenders)) * 45);

        await updateJobProgress(
          job.id,
          renderProgress,
          `Рендер ${clipIndex}/${clipStarts.length} для ${target.account.name}`,
        );

        const characterVideoPath = await ensureLocalTemplateAssetFile(target);

        const outputPath = await renderFactoryClip({
          jobId: job.id,
          clipIndex,
          sourcePath,
          lanaPath: characterVideoPath,
          startSec,
          clipSeconds: job.clipSeconds,
          template: getTargetTemplate(target),
          isCanceled: () => isJobCanceled(job.id),
        });

        try {
          await assertNotCanceled(job.id);

          const storageKey = `${getR2Prefix()}/jobs/${job.id}/targets/${
            target.accountId
          }/clips/${String(clipIndex).padStart(4, "0")}.mp4`;

          const uploadedKey = await uploadFileToR2({
            key: storageKey,
            filePath: outputPath,
            contentType: "video/mp4",
          });

          await db(() =>
            prisma.factoryJob.update({
              where: {
                id: job.id,
              },
              data: {
                status: "PUBLISHING",
                progress:
                  75 +
                  Math.round(
                    (completedRenders / Math.max(1, totalRenders)) * 20,
                  ),
                progressLabel: `Публикация ${clipIndex}/${clipStarts.length} в ${target.account.name}`,
              },
            }),
          );

          const publish = await db(() =>
            prisma.factoryPublish.create({
              data: {
                clipId: clip.id,
                targetId: target.id,
                accountId: target.accountId,
                platform: target.platform,
                status: "QUEUED",
                renderFilePath: outputPath,
                renderStorageKey: uploadedKey,
              },
            }),
          );

          if (target.platform === "YOUTUBE") {
            await db(() =>
              prisma.factoryPublish.update({
                where: {
                  id: publish.id,
                },
                data: {
                  status: "UPLOADING",
                  error: null,
                },
              }),
            );

            try {
              const result = await uploadYoutubeShort({
                accountId: target.accountId,
                filePath: outputPath,
                title,
                description,
              });

              await db(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "PUBLISHED",
                    platformPostId: result.id,
                    platformUrl: result.url,
                    error: null,
                  },
                }),
              );
            } catch (error) {
              await safeDb(() =>
                prisma.factoryPublish.update({
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
                }),
              );
            }
          }

          if (target.platform === "TIKTOK") {
            await db(() =>
              prisma.factoryPublish.update({
                where: {
                  id: publish.id,
                },
                data: {
                  status: "UPLOADING",
                  error: null,
                },
              }),
            );

            try {
              const result = await uploadTikTokDraft({
                accountId: target.accountId,
                filePath: outputPath,
                title,
                description,
              });

              await db(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "PUBLISHED",
                    platformPostId: result.id,
                    platformUrl: result.url,
                    error: result.message,
                  },
                }),
              );
            } catch (error) {
              await safeDb(() =>
                prisma.factoryPublish.update({
                  where: {
                    id: publish.id,
                  },
                  data: {
                    status: "FAILED",
                    error:
                      error instanceof Error
                        ? error.message
                        : "TikTok draft upload failed",
                  },
                }),
              );
            }
          }

          completedRenders += 1;
        } finally {
          await rm(outputPath, { force: true });
        }
      }
    }

    await db(() =>
      prisma.factoryJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: "DONE",
          progress: 100,
          progressLabel: "Готово",
        },
      }),
    );

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    console.log(`Job ${job.id} done`);
    return true;
  } catch (error) {
    console.error(error);

    const isCanceledError =
      error instanceof Error && error.message.toLowerCase().includes("отмен");

    if (isCanceledError) {
      await markJobCanceled(job.id);
    } else {
      await markJobFailed(job.id, error);
    }

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    return true;
  }
}

async function resetInterruptedJobs() {
  await db(() =>
    prisma.factoryJob.updateMany({
      where: {
        status: {
          in: ["DOWNLOADING", "RENDERING", "PUBLISHING"],
        },
      },
      data: {
        status: "QUEUED",
        progressLabel: "Задача восстановлена после перезапуска worker",
      },
    }),
  );
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
