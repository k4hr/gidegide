import { rm } from "node:fs/promises";

import { prisma } from "@/lib/prisma";
import {
  downloadYoutubeSource,
  getSourceDuration,
  renderFactoryClip,
} from "@/lib/factory/render";
import { uploadYoutubeShort } from "@/lib/factory/youtube";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
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
      },
    });

    sourcePath = await downloadYoutubeSource(job.id, job.sourceUrl);
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
      },
    });

    for (let i = 0; i < clipStarts.length; i += 1) {
      const clipIndex = i + 1;
      const startSec = clipStarts[i];
      const endSec = startSec + job.clipSeconds;
      const title = `${job.titlePrefix} #${clipIndex}`;

      const clip = await prisma.factoryClip.create({
        data: {
          jobId: job.id,
          index: clipIndex,
          startSec,
          endSec,
          title,
        },
      });

      const outputPath = await renderFactoryClip({
        jobId: job.id,
        clipIndex,
        sourcePath,
        lanaPath: randomItem(lanaVideos).filePath,
        startSec,
        clipSeconds: job.clipSeconds,
      });

      await prisma.factoryClip.update({
        where: {
          id: clip.id,
        },
        data: {
          filePath: outputPath,
        },
      });

      for (const platform of job.platforms) {
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
    }

    await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "DONE",
      },
    });

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    console.log(`Job ${job.id} done`);
    return true;
  } catch (error) {
    console.error(error);

    await prisma.factoryJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    if (sourcePath) {
      await rm(sourcePath, { force: true });
    }

    return true;
  }
}

async function main() {
  console.log("Factory worker started");

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
