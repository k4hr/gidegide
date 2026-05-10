import { NextResponse } from "next/server";
import { google } from "googleapis";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { getYoutubeOAuthClient } from "@/lib/factory/youtube-analytics";

export const runtime = "nodejs";

const MAX_IMPORT_VIDEOS = 200;
const PAGE_SIZE = 50;

type YoutubeVideo = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  url: string;
};

type PlaylistItem = {
  contentDetails?: {
    videoId?: string | null;
  } | null;
  snippet?: {
    title?: string | null;
    description?: string | null;
    publishedAt?: string | null;
    resourceId?: {
      videoId?: string | null;
    } | null;
  } | null;
};

type YoutubeVideoItem = {
  id?: string | null;
  snippet?: {
    title?: string | null;
    description?: string | null;
    publishedAt?: string | null;
  } | null;
  status?: {
    privacyStatus?: string | null;
  } | null;
};

function toDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getVideoUrl(videoId: string) {
  return `https://youtube.com/watch?v=${videoId}`;
}

async function getUploadsPlaylistId(youtube: ReturnType<typeof google.youtube>) {
  const channelsResponse = (await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
    maxResults: 1,
  })) as {
    data: {
      items?: Array<{
        contentDetails?: {
          relatedPlaylists?: {
            uploads?: string | null;
          } | null;
        } | null;
      }>;
    };
  };

  const uploadsPlaylistId =
    channelsResponse.data.items?.[0]?.contentDetails?.relatedPlaylists
      ?.uploads ?? null;

  if (!uploadsPlaylistId) {
    throw new Error("Не удалось найти uploads playlist для YouTube-канала");
  }

  return uploadsPlaylistId;
}

async function collectVideoIdsFromUploadsPlaylist(input: {
  youtube: ReturnType<typeof google.youtube>;
  uploadsPlaylistId: string;
}) {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  while (videoIds.length < MAX_IMPORT_VIDEOS) {
    const playlistResponse = (await input.youtube.playlistItems.list({
      part: ["contentDetails", "snippet"],
      playlistId: input.uploadsPlaylistId,
      maxResults: PAGE_SIZE,
      pageToken,
    })) as {
      data: {
        items?: PlaylistItem[];
        nextPageToken?: string | null;
      };
    };

    const items = playlistResponse.data.items ?? [];

    for (const item of items) {
      const videoId =
        item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? "";

      if (videoId && !videoIds.includes(videoId)) {
        videoIds.push(videoId);
      }

      if (videoIds.length >= MAX_IMPORT_VIDEOS) {
        break;
      }
    }

    pageToken = playlistResponse.data.nextPageToken ?? undefined;

    if (!pageToken || items.length === 0) {
      break;
    }
  }

  return videoIds;
}

async function fetchVideos(input: {
  youtube: ReturnType<typeof google.youtube>;
  videoIds: string[];
}) {
  const videos: YoutubeVideo[] = [];

  for (let index = 0; index < input.videoIds.length; index += 50) {
    const batch = input.videoIds.slice(index, index + 50);

    const videosResponse = (await input.youtube.videos.list({
      part: ["snippet", "status", "contentDetails"],
      id: batch,
      maxResults: 50,
    })) as {
      data: {
        items?: YoutubeVideoItem[];
      };
    };

    const items = videosResponse.data.items ?? [];

    for (const item of items) {
      const videoId = item.id ?? "";

      if (!videoId) continue;

      if (item.status?.privacyStatus && item.status.privacyStatus !== "public") {
        continue;
      }

      videos.push({
        videoId,
        title: item.snippet?.title ?? `YouTube video ${videoId}`,
        description: item.snippet?.description ?? "",
        publishedAt: toDate(item.snippet?.publishedAt),
        url: getVideoUrl(videoId),
      });
    }
  }

  return videos;
}

async function importVideo(input: {
  accountId: string;
  video: YoutubeVideo;
}) {
  const existingPublish = await withDbRetry(() =>
    prisma.factoryPublish.findFirst({
      where: {
        platform: "YOUTUBE",
        platformPostId: input.video.videoId,
      },
      select: {
        id: true,
      },
    }),
  );

  if (existingPublish) {
    return "skipped" as const;
  }

  await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      const job = await tx.factoryJob.create({
        data: {
          sourceUrl: input.video.url,
          sourceFilePath: null,
          sourceStorageKey: null,
          sourceOriginalName: null,
          sourceSizeBytes: null,

          clipSeconds: 60,
          clipStartIndex: 0,
          titlePrefix: "imported roblox video",
          game: "ROBLOX",

          templateId: null,
          platforms: ["YOUTUBE"],

          status: "DONE",
          error: null,
          totalClips: 1,

          progress: 100,
          progressLabel: "Imported from YouTube history",
          publishTiming: "NOW",
          scheduledAt: null,

          cutMode: "SEQUENTIAL",
          smartStepSeconds: 10,
          smartCandidates: 80,
          smartMinGapSeconds: 30,

          cancelRequested: false,
          canceledAt: null,
        },
      });

      const clip = await tx.factoryClip.create({
        data: {
          jobId: job.id,
          index: 1,
          startSec: 0,
          endSec: 60,
          title: input.video.title,
          filePath: null,
          storageKey: null,
        },
      });

      await tx.factoryPublish.create({
        data: {
          clipId: clip.id,
          targetId: null,
          accountId: input.accountId,

          platform: "YOUTUBE",
          status: "PUBLISHED",

          platformPostId: input.video.videoId,
          platformUrl: input.video.url,
          title: input.video.title,
          description: input.video.description,
          publishedAt: input.video.publishedAt,

          renderFilePath: null,
          renderStorageKey: null,

          error: null,
        },
      });
    }),
  );

  return "imported" as const;
}

export async function POST() {
  try {
    const account = await withDbRetry(() =>
      prisma.factoryAccount.findFirst({
        where: {
          platform: "YOUTUBE",
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    );

    if (!account) {
      return NextResponse.json(
        {
          error: "YouTube-аккаунт не найден. Сначала подключи Amelia на /factory/accounts.",
        },
        {
          status: 400,
        },
      );
    }

    if (!account.refreshToken) {
      return NextResponse.json(
        {
          error:
            "У YouTube-аккаунта нет refreshToken. Удали аккаунт на /factory/accounts и подключи заново через Google OAuth.",
        },
        {
          status: 400,
        },
      );
    }

    const oauth2Client = getYoutubeOAuthClient(account);
    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    const uploadsPlaylistId = await getUploadsPlaylistId(youtube);
    const videoIds = await collectVideoIdsFromUploadsPlaylist({
      youtube,
      uploadsPlaylistId,
    });

    const videos = await fetchVideos({
      youtube,
      videoIds,
    });

    let imported = 0;
    let skipped = 0;
    const errors: Array<{
      videoId: string;
      message: string;
    }> = [];

    for (const video of videos) {
      try {
        const result = await importVideo({
          accountId: account.id,
          video,
        });

        if (result === "imported") {
          imported += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        errors.push({
          videoId: video.videoId,
          message:
            error instanceof Error
              ? error.message
              : "Не удалось импортировать видео",
        });
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 20),
      totalSeen: videos.length,
      totalVideoIds: videoIds.length,
      uploadsPlaylistId,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось импортировать историю YouTube-видео",
      },
      {
        status: 500,
      },
    );
  }
}
