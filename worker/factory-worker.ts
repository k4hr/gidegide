import fs from "node:fs";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import { FACTORY_LANA_DIR, FACTORY_SOURCE_DIR } from "@/lib/factory/paths";
import {
  downloadSourceFromUrl,
  getSourceDuration,
  renderCenteredMovieClip,
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
import { generateMovieAiTitlePack } from "@/lib/factory/movie-ai-titles";
import {
  buildMovieSmartClipStarts,
  buildSequentialClipStarts,
  buildSmartClipStarts,
} from "@/lib/factory/smart-cut";
import { humanizeFactoryError, notifyTelegramJob } from "@/lib/factory/telegram";
import {
  processDueVkAutoSources,
  updateVkAutoSourceVideoFromJob,
} from "@/lib/factory/vk-auto-source";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type UploadScheduleConfig = {
  type?: string;
  startHour: number;
  endHour: number;
  intervalMinutes: number;
  timeZone: string;
};

function parseUploadSchedule(
  value?: string | null,
): UploadScheduleConfig | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      uploadSchedule?: UploadScheduleConfig;
    };
    const schedule = parsed.uploadSchedule;

    if (!schedule || schedule.type !== "WINDOW_INTERVAL") {
      return null;
    }

    return {
      type: "WINDOW_INTERVAL",
      startHour: Math.max(0, Math.min(23, Number(schedule.startHour) || 14)),
      endHour: Math.max(1, Math.min(24, Number(schedule.endHour) || 23)),
      intervalMinutes: Math.max(
        15,
        Math.min(180, Number(schedule.intervalMinutes) || 60),
      ),
      timeZone: schedule.timeZone || "Europe/Moscow",
    };
  } catch {
    return null;
  }
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;

  return {
    year: parts.year,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour === 24 ? 0 : (parts.hour ?? 0),
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  };
}

function makeDateInTimeZone(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timeZone: string;
}) {
  const utcGuess = new Date(
    Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second ?? 0,
    ),
  );

  const represented = getTimeZoneParts(utcGuess, input.timeZone);
  const representedAsUtc = Date.UTC(
    represented.year,
    represented.month - 1,
    represented.day,
    represented.hour,
    represented.minute,
    represented.second,
  );
  const offsetMs = representedAsUtc - utcGuess.getTime();

  return new Date(utcGuess.getTime() - offsetMs);
}

function addDays(input: {
  year: number;
  month: number;
  day: number;
  days: number;
}) {
  const date = new Date(
    Date.UTC(input.year, input.month - 1, input.day + input.days, 12, 0, 0),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getScheduledUploadAt(input: {
  schedule: UploadScheduleConfig | null;
  clipIndex: number;
  now?: Date;
}) {
  if (!input.schedule) return null;

  const now = input.now ?? new Date();
  const parts = getTimeZoneParts(now, input.schedule.timeZone);
  const startMinutes = input.schedule.startHour * 60;
  const endMinutes = input.schedule.endHour * 60;
  const interval = input.schedule.intervalMinutes;
  const slotsPerDay = Math.max(
    1,
    Math.floor((endMinutes - startMinutes) / interval),
  );
  const currentMinutes = parts.hour * 60 + parts.minute;

  let baseDayOffset = 0;
  let firstSlotIndex = 0;

  if (currentMinutes < startMinutes) {
    firstSlotIndex = 0;
  } else if (currentMinutes >= endMinutes) {
    baseDayOffset = 1;
    firstSlotIndex = 0;
  } else {
    firstSlotIndex = Math.ceil((currentMinutes - startMinutes) / interval);
    if (firstSlotIndex >= slotsPerDay) {
      baseDayOffset = 1;
      firstSlotIndex = 0;
    }
  }

  const absoluteSlot = firstSlotIndex + Math.max(0, input.clipIndex - 1);
  const dayOffset = baseDayOffset + Math.floor(absoluteSlot / slotsPerDay);
  const slotInDay = absoluteSlot % slotsPerDay;
  const dateParts = addDays({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    days: dayOffset,
  });
  const targetMinutes = startMinutes + slotInDay * interval;

  return makeDateInTimeZone({
    ...dateParts,
    hour: Math.floor(targetMinutes / 60),
    minute: targetMinutes % 60,
    second: 0,
    timeZone: input.schedule.timeZone,
  });
}

function formatScheduleDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function waitForScheduledUpload(input: {
  jobId: string;
  clipIndex: number;
  totalClips: number;
  schedule: UploadScheduleConfig | null;
}) {
  const scheduledAt = getScheduledUploadAt({
    schedule: input.schedule,
    clipIndex: input.clipIndex,
  });

  if (!scheduledAt) return;

  while (scheduledAt.getTime() > Date.now()) {
    await assertNotCanceled(input.jobId);
    const waitMs = scheduledAt.getTime() - Date.now();
    const waitMinutes = Math.max(1, Math.ceil(waitMs / 60000));

    await updateJobProgress(
      input.jobId,
      76,
      `Ожидаю окно публикации ${input.clipIndex}/${input.totalClips}: ${formatScheduleDate(scheduledAt, input.schedule?.timeZone ?? "Europe/Moscow")} · осталось ${waitMinutes} мин`,
    );

    await sleep(Math.min(waitMs, 60000));
  }
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

async function updateJobProgress(
  jobId: string,
  progress: number,
  label: string,
) {
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
      onProgress: (progress, label) =>
        updateJobProgress(job.id, progress, label),
    });
  }

  throw new Error("У задачи нет исходного MP4 и нет YouTube-ссылки");
}

function getDefaultTemplate(): FactoryRenderTemplate {
  return {
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

function isMovieSmartJob(job: {
  cutMode?: string;
  titlePrefix?: string | null;
}) {
  return (
    job.cutMode === "MOVIE_SMART" ||
    job.titlePrefix?.startsWith("MOVIE_MOMENTS::") ||
    job.titlePrefix?.startsWith("VK_RU:")
  );
}

async function processOneJob() {
  const job = await db(() =>
    prisma.factoryJob.findFirst({
      where: {
        status: "QUEUED",
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
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

    const movieSmartJob = isMovieSmartJob(job);
    const uploadSchedule = parseUploadSchedule(job.recommendation);

    if (!movieSmartJob) {
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

    await notifyTelegramJob(job.id, "⬇️ Исходник скачан");

    await assertNotCanceled(job.id);

    const duration = await getSourceDuration(sourcePath);

    const targetMaxClips = targets.reduce(
      (min, target) => Math.min(min, Math.max(1, target.maxClips ?? 1)),
      Number(process.env.FACTORY_MAX_CLIPS_PER_JOB ?? 40),
    );
    const maxClips = Math.max(
      1,
      Math.min(
        Number(process.env.FACTORY_MAX_CLIPS_PER_JOB ?? 40),
        targetMaxClips,
      ),
    );
    let clipStarts: number[] = [];

    if (movieSmartJob) {
      clipStarts = await buildMovieSmartClipStarts({
        sourcePath,
        duration,
        clipSeconds: job.clipSeconds,
        maxClips,
        windowSeconds: 600,
        windowsPerMovie: 4,
        windowStepSeconds: Math.max(30, job.smartStepSeconds || 60),
        skipIntroSeconds: 240,
        skipOutroSeconds: 240,
        minGapBetweenWindowsSeconds: 600,
        onProgress: (progress, label) =>
          updateJobProgress(job.id, progress, label),
        isCanceled: () => isJobCanceled(job.id),
      });
    } else if (job.cutMode === "SMART_LITE") {
      clipStarts = await buildSmartClipStarts({
        sourcePath,
        duration,
        clipSeconds: job.clipSeconds,
        maxClips,
        stepSeconds: job.smartStepSeconds,
        maxCandidates: job.smartCandidates,
        minGapSeconds: job.smartMinGapSeconds,
        clipStartIndex: job.clipStartIndex,
        onProgress: (progress, label) =>
          updateJobProgress(job.id, progress, label),
        isCanceled: () => isJobCanceled(job.id),
      });
    } else {
      clipStarts = buildSequentialClipStarts({
        duration,
        clipSeconds: job.clipSeconds,
        maxClips,
        clipStartIndex: job.clipStartIndex,
      });
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

    await notifyTelegramJob(job.id, `✂️ Найдено ${clipStarts.length} нарезок`);

    const movieAiTitles = movieSmartJob
      ? await generateMovieAiTitlePack({
          sourceTitle: job.sourceOriginalName ?? job.titlePrefix,
          userDescription: job.longVideoDescription,
          totalClips: clipStarts.length,
          clipSeconds: job.clipSeconds,
          clipStarts,
          onProgress: (progress, label) => updateJobProgress(job.id, progress, label),
        })
      : null;

    if (movieAiTitles) {
      await updateJobProgress(
        job.id,
        36,
        movieAiTitles.source === "openai"
          ? `AI-названия готовы: ${movieAiTitles.movieTitle}`
          : `AI недоступен, использую сильные шаблоны: ${movieAiTitles.movieTitle}`,
      );
    }

    const totalRenders = clipStarts.length * targets.length;
    let completedRenders = 0;

    for (let i = 0; i < clipStarts.length; i += 1) {
      await assertNotCanceled(job.id);

      const clipIndex = i + 1;
      const startSec = clipStarts[i];
      const endSec = startSec + job.clipSeconds;

      const baseTitle =
        movieAiTitles?.titles[i] ??
        buildClipTitle({
          game: job.game,
          clipIndex,
          customPrefix: job.titlePrefix,
          sourceTitle: job.sourceOriginalName,
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

        const title =
          movieAiTitles?.titles[i] ??
          buildClipTitle({
            game: job.game,
            clipIndex,
            customPrefix: titlePrefixForTarget,
            sourceTitle: job.sourceOriginalName,
          });

        const description =
          job.longVideoDescription?.trim() ||
          movieAiTitles?.description ||
          buildClipDescription({
            game: job.game,
            customPrefix: titlePrefixForTarget,
            title,
            sourceTitle: job.sourceOriginalName,
          });

        const renderProgress =
          30 + Math.round((completedRenders / Math.max(1, totalRenders)) * 45);

        await updateJobProgress(
          job.id,
          renderProgress,
          `Рендер ${clipIndex}/${clipStarts.length} для ${target.account.name}`,
        );

        const outputPath = movieSmartJob
          ? await renderCenteredMovieClip({
              jobId: job.id,
              clipIndex,
              sourcePath,
              startSec,
              clipSeconds: job.clipSeconds,
              isCanceled: () => isJobCanceled(job.id),
            })
          : await renderFactoryClip({
              jobId: job.id,
              clipIndex,
              sourcePath,
              lanaPath: await ensureLocalTemplateAssetFile(target),
              startSec,
              clipSeconds: job.clipSeconds,
              template: getTargetTemplate(target),
              isCanceled: () => isJobCanceled(job.id),
            });

        await notifyTelegramJob(job.id, `🎬 Рендер: ${clipIndex}/${clipStarts.length}`);

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
                title,
                description,
              },
            }),
          );

          if (target.platform === "YOUTUBE") {
            await waitForScheduledUpload({
              jobId: job.id,
              clipIndex,
              totalClips: clipStarts.length,
              schedule: uploadSchedule,
            });

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

              await notifyTelegramJob(
                job.id,
                `✅ Опубликовано ${clipIndex}/${clipStarts.length}: ${result.url}`,
              );
              await updateVkAutoSourceVideoFromJob(job.id, {
                status: "PUBLISHED",
                url: result.url,
              });
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
              await notifyTelegramJob(
                job.id,
                `❌ Ошибка публикации ${clipIndex}/${clipStarts.length}: ${humanizeFactoryError(error)}`,
              );
              await updateVkAutoSourceVideoFromJob(job.id, {
                status: "FAILED",
                error,
              });
            }
          }

          if (target.platform === "TIKTOK") {
            await waitForScheduledUpload({
              jobId: job.id,
              clipIndex,
              totalClips: clipStarts.length,
              schedule: uploadSchedule,
            });

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
      await notifyTelegramJob(job.id, "🛑 Задача отменена.");
      await updateVkAutoSourceVideoFromJob(job.id, {
        status: "FAILED",
        error: new Error("Задача отменена"),
      });
    } else {
      await markJobFailed(job.id, error);
      await notifyTelegramJob(job.id, `❌ Ошибка: ${humanizeFactoryError(error)}`);
      await updateVkAutoSourceVideoFromJob(job.id, {
        status: "FAILED",
        error,
      });
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
  void runVkAutoSourceLoop();

  while (true) {
    const processed = await processOneJob();

    if (!processed) {
      await sleep(5000);
    }
  }
}

async function runVkAutoSourceLoop() {
  while (true) {
    try {
      const started = await processDueVkAutoSources();
      if (started) console.log(`VK auto-source runs started: ${started}`);
    } catch (error) {
      console.error("VK auto-source scheduler failed:", error);
    }
    await sleep(5 * 60 * 1000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
