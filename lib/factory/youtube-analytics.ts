import { google } from "googleapis";

import { prisma } from "../prisma";

type YoutubeAccount = {
  id: string;
  platform: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

type YoutubeBasicVideoStats = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: Date | null;
  duration: string;
  views: number;
  likes: number;
  comments: number;
};

type YoutubeDeepVideoStats = {
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  shares: number;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function toInt(value: unknown) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numberValue));
}

function toFloat(value: unknown) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, numberValue);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function getYoutubeOAuthClient(account: YoutubeAccount) {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_REDIRECT_URI"),
  );

  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken ?? undefined,
    expiry_date: account.expiresAt?.getTime(),
  });

  oauth2Client.on("tokens", async (tokens) => {
    await prisma.factoryAccount.update({
      where: {
        id: account.id,
      },
      data: {
        accessToken: tokens.access_token ?? account.accessToken,
        refreshToken: tokens.refresh_token ?? account.refreshToken,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : account.expiresAt,
      },
    });
  });

  return oauth2Client;
}

export async function fetchYoutubeBasicVideoStats(input: {
  account: YoutubeAccount;
  videoIds: string[];
}) {
  const uniqueVideoIds = Array.from(new Set(input.videoIds.filter(Boolean)));

  if (uniqueVideoIds.length === 0) {
    return new Map<string, YoutubeBasicVideoStats>();
  }

  const oauth2Client = getYoutubeOAuthClient(input.account);
  const youtube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  const result = new Map<string, YoutubeBasicVideoStats>();

  for (let index = 0; index < uniqueVideoIds.length; index += 50) {
    const batch = uniqueVideoIds.slice(index, index + 50);

    const response = await youtube.videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: batch,
      maxResults: 50,
    });

    for (const item of response.data.items ?? []) {
      if (!item.id) continue;

      result.set(item.id, {
        videoId: item.id,
        title: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        publishedAt: item.snippet?.publishedAt
          ? new Date(item.snippet.publishedAt)
          : null,
        duration: item.contentDetails?.duration ?? "",
        views: toInt(item.statistics?.viewCount),
        likes: toInt(item.statistics?.likeCount),
        comments: toInt(item.statistics?.commentCount),
      });
    }
  }

  return result;
}

async function queryAnalyticsWithMetrics(input: {
  account: YoutubeAccount;
  videoId: string;
  metrics: string;
  startDate: string;
  endDate: string;
}) {
  const oauth2Client = getYoutubeOAuthClient(input.account);
  const youtubeAnalytics = google.youtubeAnalytics({
    version: "v2",
    auth: oauth2Client,
  });

  return youtubeAnalytics.reports.query({
    ids: "channel==MINE",
    startDate: input.startDate,
    endDate: input.endDate,
    metrics: input.metrics,
    filters: `video==${input.videoId}`,
  });
}

export async function fetchYoutubeDeepVideoStats(input: {
  account: YoutubeAccount;
  videoId: string;
  publishedAt: Date | null;
}) {
  const now = new Date();
  const start = input.publishedAt
    ? new Date(input.publishedAt)
    : new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);

  start.setUTCDate(start.getUTCDate() - 1);

  const startDate = toDateOnly(start);
  const endDate = toDateOnly(now);

  const empty: YoutubeDeepVideoStats = {
    estimatedMinutesWatched: 0,
    averageViewDuration: 0,
    averageViewPercentage: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    shares: 0,
  };

  try {
    const fullMetrics =
      "estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,shares";

    const response = await queryAnalyticsWithMetrics({
      account: input.account,
      videoId: input.videoId,
      metrics: fullMetrics,
      startDate,
      endDate,
    });

    const row = response.data.rows?.[0] ?? [];

    return {
      estimatedMinutesWatched: toInt(row[0]),
      averageViewDuration: toFloat(row[1]),
      averageViewPercentage: toFloat(row[2]),
      subscribersGained: toInt(row[3]),
      subscribersLost: toInt(row[4]),
      shares: toInt(row[5]),
    };
  } catch (error) {
    console.warn(
      `YouTube Analytics full metrics failed for ${input.videoId}. Retrying without shares.`,
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const fallbackMetrics =
      "estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost";

    const response = await queryAnalyticsWithMetrics({
      account: input.account,
      videoId: input.videoId,
      metrics: fallbackMetrics,
      startDate,
      endDate,
    });

    const row = response.data.rows?.[0] ?? [];

    return {
      ...empty,
      estimatedMinutesWatched: toInt(row[0]),
      averageViewDuration: toFloat(row[1]),
      averageViewPercentage: toFloat(row[2]),
      subscribersGained: toInt(row[3]),
      subscribersLost: toInt(row[4]),
    };
  } catch (error) {
    console.warn(
      `YouTube Analytics fallback failed for ${input.videoId}.`,
      error instanceof Error ? error.message : error,
    );

    return empty;
  }
}
