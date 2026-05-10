import { NextResponse } from "next/server";
import { google } from "googleapis";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { getYoutubeOAuthClient } from "@/lib/factory/youtube-analytics";

export const runtime = "nodejs";

// YouTube search/list returns max 50 per page; we paginate up to 4 pages (~200 videos)
const MAX_PAGES = 4;
const PAGE_SIZE = 50;

export async function POST() {
  try {
    // 1. Find the latest YouTube FactoryAccount
    const account = await withDbRetry(() =>
      prisma.factoryAccount.findFirst({
        where: { platform: "YOUTUBE" },
        orderBy: { createdAt: "desc" },
      }),
    );

    if (!account) {
      return NextResponse.json(
        { error: "No YouTube account found in database" },
        { status: 404 },
      );
    }

    // 2. Build authenticated OAuth client (handles token refresh + DB update)
    const oauth2Client = getYoutubeOAuthClient(account);

    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    // 3. Paginate through the channel's uploaded videos
    const allVideos: Array<{
      videoId: string;
      title: string;
      description: string;
      publishedAt: Date | null;
    }> = [];

    let pageToken: string | undefined = undefined;
    let pagesCollected = 0;

    while (pagesCollected < MAX_PAGES) {
      const searchResponse = await youtube.search.list({
        part: ["snippet"],
        forMine: true,
        type: ["video"],
        order: "date",
        maxResults: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      });

      const items = searchResponse.data.items ?? [];

      for (const item of items) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;

        allVideos.push({
          videoId,
          title: item.snippet?.title ?? "",
          description: item.snippet?.description ?? "",
          publishedAt: item.snippet?.publishedAt
            ? new Date(item.snippet.publishedAt)
            : null,
        });
      }

      pagesCollected += 1;

      const nextPageToken = searchResponse.data.nextPageToken;
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    // 4. Fetch full statistics for all collected videos in batches of 50
    const videoIds = allVideos.map((v) => v.videoId);
    const statsMap = new Map<
      string,
      { views: number; likes: number; comments: number }
    >();

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);

      const statsResponse = await youtube.videos.list({
        part: ["snippet", "statistics", "status"],
        id: batch,
        maxResults: 50,
      });

      for (const item of statsResponse.data.items ?? []) {
        if (!item.id) continue;

        // Only import public videos
        if (item.status?.privacyStatus !== "public") continue;

        statsMap.set(item.id, {
          views: Number(item.statistics?.viewCount ?? 0),
          likes: Number(item.statistics?.likeCount ?? 0),
          comments: Number(item.statistics?.commentCount ?? 0),
        });
      }
    }

    // Filter to only public videos (those present in statsMap)
    const publicVideos = allVideos.filter((v) => statsMap.has(v.videoId));

    // 5. Import each video that doesn't already have a FactoryPublish record
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const video of publicVideos) {
      try {
        // Check if already imported
        const existing = await withDbRetry(() =>
          prisma.factoryPublish.findFirst({
            where: { platformPostId: video.videoId },
          }),
        );

        if (existing) {
          skipped += 1;
          continue;
        }

        // Create FactoryJob + FactoryClip + FactoryPublish in a transaction
        await withDbRetry(() =>
          prisma.$transaction(async (tx) => {
            const job = await tx.factoryJob.create({
              data: {
                sourceUrl: `https://www.youtube.com/watch?v=${video.videoId}`,
                clipSeconds: 60,
                titlePrefix: "imported roblox video",
                game: "ROBLOX",
                platforms: ["YOUTUBE"],
                status: "DONE",
                totalClips: 1,
                progress: 100,
                progressLabel: "Imported from YouTube history",
              },
            });

            const clip = await tx.factoryClip.create({
              data: {
                jobId: job.id,
                index: 1,
                startSec: 0,
                endSec: 60,
                title: video.title,
                filePath: null,
                storageKey: null,
              },
            });

            await tx.factoryPublish.create({
              data: {
                clipId: clip.id,
                accountId: account.id,
                platform: "YOUTUBE",
                status: "PUBLISHED",
                platformPostId: video.videoId,
                platformUrl: `https://youtube.com/watch?v=${video.videoId}`,
                title: video.title,
                description: video.description,
                publishedAt: video.publishedAt,
              },
            });
          }),
        );

        imported += 1;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        errors.push(`Video ${video.videoId}: ${message}`);
        console.error(`Failed to import video ${video.videoId}:`, err);
      }
    }

    const message =
      `Import complete. Scanned ${publicVideos.length} public videos: ` +
      `${imported} imported, ${skipped} already in database` +
      (errors.length > 0 ? `, ${errors.length} errors.` : ".");

    return NextResponse.json({ imported, skipped, errors, message });
  } catch (error) {
    console.error("import-youtube-history error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import YouTube history",
      },
      { status: 500 },
    );
  }
}
