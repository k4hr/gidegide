import { google, type youtube_v3 } from "googleapis";
import type { FactoryDonorKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { getYoutubeOAuthClient } from "@/lib/factory/youtube-analytics";

export type SuperUploadVideo = {
  sourceVideoId: string;
  sourceKind?: FactoryDonorKind;
  sourceUrl: string;
  channelId: string | null;
  channelTitle: string | null;
  donorChannelId?: string | null;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: Date | null;
  views: number;
  likes: number;
  comments: number;
  viewsPerDay: number;
  likeRate: number;
  commentRate: number;
  sourceScore: number;
  viralChance: number;
  suggestedClips: number;
  suggestedHookMode: string;
  suggestedWindow: string;
};

export type SuperUploadScheduleSlot = {
  index: number;
  scheduledAt: Date;
  label: string;
  dayIndex: number;
  localHour: number;
  localMinute: number;
};

const MAX_ANALYZE_VIDEOS = 100;
const PAGE_SIZE = 50;
const NEW_YORK_TIME_ZONE = "Europe/Moscow";
export const SUPER_UPLOAD_DONOR_KIND: FactoryDonorKind = "SUPER_UPLOAD";
export const STORY_SHORTS_DONOR_KIND: FactoryDonorKind = "STORY_SHORTS";
export const MOVIE_MOMENTS_DONOR_KIND: FactoryDonorKind = "MOVIE_MOMENTS";

function toInt(value: unknown) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numberValue));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeUrl(value: string) {
  return value.trim();
}

function getVideoUrl(videoId: string) {
  return `https://youtube.com/watch?v=${videoId}`;
}

function parseYouTubeUrl(value: string) {
  const normalized = normalizeUrl(value);
  const result: {
    raw: string;
    videoId?: string;
    channelId?: string;
    handle?: string;
    playlistId?: string;
    searchText?: string;
  } = {
    raw: normalized,
  };

  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "");
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (!host.includes("youtube.com") && !host.includes("youtu.be")) {
      result.searchText = normalized;
      return result;
    }

    if (host === "youtu.be" && pathParts[0]) {
      result.videoId = pathParts[0];
      return result;
    }

    const watchVideoId = url.searchParams.get("v");
    const playlistId = url.searchParams.get("list");

    if (playlistId) {
      result.playlistId = playlistId;
    }

    if (watchVideoId) {
      result.videoId = watchVideoId;
      return result;
    }

    if (pathParts[0] === "shorts" && pathParts[1]) {
      result.videoId = pathParts[1];
      return result;
    }

    if (pathParts[0] === "channel" && pathParts[1]) {
      result.channelId = pathParts[1];
      return result;
    }

    const handlePart = pathParts.find((part) => part.startsWith("@"));

    if (handlePart) {
      result.handle = handlePart.replace(/^@/, "");
      return result;
    }

    if (pathParts[0]) {
      result.searchText = pathParts[pathParts.length - 1];
      return result;
    }
  } catch {
    result.searchText = normalized;
  }

  return result;
}

function parseIsoDuration(value: string | null | undefined) {
  if (!value) return null;

  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return null;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  return hours * 3600 + minutes * 60 + seconds;
}

function getDaysSince(date: Date | null) {
  if (!date) return 365;

  return Math.max(1, (Date.now() - date.getTime()) / 86_400_000);
}

function scoreViewsPerDay(viewsPerDay: number) {
  if (viewsPerDay >= 100_000) return 35;
  if (viewsPerDay >= 50_000) return 31;
  if (viewsPerDay >= 20_000) return 26;
  if (viewsPerDay >= 10_000) return 21;
  if (viewsPerDay >= 5_000) return 16;
  if (viewsPerDay >= 2_000) return 10;
  if (viewsPerDay >= 800) return 6;
  return 0;
}

function scoreFreshness(publishedAt: Date | null) {
  const days = getDaysSince(publishedAt);

  if (days <= 3) return 15;
  if (days <= 7) return 13;
  if (days <= 14) return 10;
  if (days <= 30) return 7;
  if (days <= 90) return 4;
  return 1;
}

function scoreDuration(durationSeconds: number | null) {
  if (!durationSeconds) return 4;
  if (durationSeconds >= 600) return 10;
  if (durationSeconds >= 240) return 8;
  if (durationSeconds >= 90) return 6;
  if (durationSeconds >= 30) return 4;
  return 1;
}

function scoreRobloxRelevance(input: { title: string; description: string }) {
  const text = `${input.title} ${input.description}`.toLowerCase();
  let score = 0;

  if (text.includes("roblox")) score += 5;
  if (text.includes("obby")) score += 2;
  if (text.includes("parkour")) score += 1;
  if (text.includes("escape")) score += 1;
  if (text.includes("tower")) score += 1;

  return clamp(score, 0, 10);
}


function scoreMovieMomentRelevance(input: { title: string; description: string; durationSeconds: number | null }) {
  const text = `${input.title} ${input.description}`.toLowerCase();
  const duration = input.durationSeconds ?? 0;
  let score = 0;

  if (duration >= 1200) score += 24;
  else if (duration >= 600) score += 18;
  else if (duration >= 240) score += 8;
  else score -= 18;

  if (text.includes("full movie")) score += 14;
  if (text.includes("full film")) score += 14;
  if (text.includes("movie")) score += 8;
  if (text.includes("film")) score += 8;
  if (text.includes("feature film")) score += 10;
  if (text.includes("classic")) score += 4;
  if (text.includes("horror")) score += 5;
  if (text.includes("thriller")) score += 4;
  if (text.includes("sci-fi") || text.includes("science fiction")) score += 4;
  if (text.includes("drama")) score += 2;

  if (text.includes("trailer")) score -= 18;
  if (text.includes("clip") || text.includes("scene")) score -= 10;
  if (text.includes("shorts") || text.includes("#shorts")) score -= 22;
  if (text.includes("music video")) score -= 18;
  if (text.includes("behind the scenes")) score -= 8;

  return clamp(score, -35, 45);
}

function getSuggestedMovieClips(durationSeconds: number | null) {
  const duration = durationSeconds ?? 0;
  if (duration >= 1200) return 3;
  if (duration >= 600) return 2;
  return 1;
}

function scoreTitleHook(title: string) {
  const normalized = title.toLowerCase();
  let score = 0;

  if (normalized.includes("impossible")) score += 2;
  if (normalized.includes("escape")) score += 2;
  if (normalized.includes("obby")) score += 2;
  if (normalized.includes("hard") || normalized.includes("insane")) score += 1;
  if (normalized.includes("funny") || normalized.includes("fail")) score += 1;
  if (normalized.includes("survive") || normalized.includes("survival")) score += 1;
  if (normalized.includes("ending") || normalized.includes("end")) score += 1;

  return clamp(score, 0, 10);
}

export function getSuggestedHookMode(input: { title: string; description: string }) {
  const text = `${input.title} ${input.description}`.toLowerCase();

  if (
    text.includes("doors") ||
    text.includes("horror") ||
    text.includes("scary") ||
    text.includes("monster")
  ) {
    return "SUSPENSE_ENDING";
  }

  if (text.includes("funny") || text.includes("fail") || text.includes("fails")) {
    return "FUNNY_FAIL";
  }

  if (
    text.includes("escape") ||
    text.includes("survive") ||
    text.includes("survival") ||
    text.includes("runner")
  ) {
    return "SURVIVAL_ENDING";
  }

  if (text.includes("obby") || text.includes("parkour") || text.includes("tower")) {
    return "IMPOSSIBLE_SUSPENSE";
  }

  return "AUTO_BEST_MIX";
}

function getSuggestedClips(input: { viralChance: number; durationSeconds: number | null; donorKind?: FactoryDonorKind }) {
  if (input.donorKind === MOVIE_MOMENTS_DONOR_KIND) {
    return getSuggestedMovieClips(input.durationSeconds);
  }

  const duration = input.durationSeconds ?? 0;
  const maxByDuration = Math.max(1, Math.floor(duration / 45));
  let wanted = 3;

  if (input.viralChance >= 90) wanted = 20;
  else if (input.viralChance >= 80) wanted = 15;
  else if (input.viralChance >= 70) wanted = 10;
  else if (input.viralChance >= 55) wanted = 5;

  return clamp(Math.min(wanted, maxByDuration || wanted), 1, 30);
}

export function scoreSourceVideo(input: {
  title: string;
  description: string;
  publishedAt: Date | null;
  durationSeconds: number | null;
  views: number;
  likes: number;
  comments: number;
  isUsed?: boolean;
  donorKind?: FactoryDonorKind;
}) {
  const days = getDaysSince(input.publishedAt);
  const viewsPerDay = input.views / days;
  const likeRate = input.views > 0 ? input.likes / input.views : 0;
  const commentRate = input.views > 0 ? input.comments / input.views : 0;

  const engagementScore = clamp(
    Math.round(likeRate * 350 + commentRate * 800),
    0,
    25,
  );

  const contentRelevance = input.donorKind === MOVIE_MOMENTS_DONOR_KIND
    ? scoreMovieMomentRelevance({
        title: input.title,
        description: input.description,
        durationSeconds: input.durationSeconds,
      })
    : scoreRobloxRelevance({ title: input.title, description: input.description });

  const score =
    scoreViewsPerDay(viewsPerDay) +
    engagementScore +
    scoreFreshness(input.publishedAt) +
    scoreDuration(input.durationSeconds) +
    scoreTitleHook(input.title) +
    contentRelevance +
    (input.isUsed ? -35 : 5);

  const viralChance = clamp(Math.round(score), 0, 100);

  return {
    viewsPerDay,
    likeRate,
    commentRate,
    sourceScore: viralChance,
    viralChance,
    suggestedClips: getSuggestedClips({
      viralChance,
      durationSeconds: input.durationSeconds,
      donorKind: input.donorKind,
    }),
    suggestedHookMode: getSuggestedHookMode({
      title: input.title,
      description: input.description,
    }),
    suggestedWindow: "ANALYTICS_BEST_WINDOW",
  };
}

async function getLatestYoutubeAccount() {
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
    throw new Error("YouTube-Р°РєРєР°СѓРЅС‚ РЅРµ РЅР°Р№РґРµРЅ. РџРѕРґРєР»СЋС‡Рё Amelia РЅР° /factory/accounts.");
  }

  return account;
}

async function getYoutubeClient() {
  const account = await getLatestYoutubeAccount();
  const auth = getYoutubeOAuthClient(account);

  return google.youtube({
    version: "v3",
    auth,
  });
}

async function getChannelFromVideo(youtube: youtube_v3.Youtube, videoId: string) {
  const response = await youtube.videos.list({
    part: ["snippet"],
    id: [videoId],
    maxResults: 1,
  });

  const item = response.data.items?.[0];
  const channelId = item?.snippet?.channelId ?? null;

  if (!channelId) {
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°Р№С‚Рё РєР°РЅР°Р» РїРѕ СЌС‚РѕРјСѓ РІРёРґРµРѕ");
  }

  return channelId;
}

async function resolveChannel(input: {
  youtube: youtube_v3.Youtube;
  sourceUrl: string;
}) {
  const parsed = parseYouTubeUrl(input.sourceUrl);

  if (parsed.channelId) {
    return parsed.channelId;
  }

  if (parsed.videoId) {
    return getChannelFromVideo(input.youtube, parsed.videoId);
  }

  if (parsed.handle) {
    const response = await input.youtube.channels.list({
      part: ["id"],
      forHandle: parsed.handle,
      maxResults: 1,
    } as youtube_v3.Params$Resource$Channels$List);

    const channelId = response.data.items?.[0]?.id ?? null;

    if (channelId) {
      return channelId;
    }
  }

  if (parsed.searchText) {
    const response = await input.youtube.search.list({
      part: ["snippet"],
      q: parsed.searchText,
      type: ["channel"],
      maxResults: 1,
    });

    const channelId = response.data.items?.[0]?.snippet?.channelId ?? null;

    if (channelId) {
      return channelId;
    }
  }

  throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РѕРїСЂРµРґРµР»РёС‚СЊ YouTube-РєР°РЅР°Р». Р’СЃС‚Р°РІСЊ СЃСЃС‹Р»РєСѓ РЅР° РєР°РЅР°Р», РІРёРґРµРѕ РёР»Рё @handle.");
}

async function getUploadsPlaylistId(input: {
  youtube: youtube_v3.Youtube;
  channelId: string;
}) {
  const response = await input.youtube.channels.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: [input.channelId],
    maxResults: 1,
  });

  const channel = response.data.items?.[0];
  const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads ?? null;

  if (!channel || !uploadsPlaylistId) {
    throw new Error("РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ uploads playlist РєР°РЅР°Р»Р°");
  }

  return {
    uploadsPlaylistId,
    channelTitle: channel.snippet?.title ?? "YouTube channel",
    subscriberCount: toInt(channel.statistics?.subscriberCount),
    videoCount: toInt(channel.statistics?.videoCount),
    viewCount: toInt(channel.statistics?.viewCount),
  };
}

async function collectUploadVideoIds(input: {
  youtube: youtube_v3.Youtube;
  uploadsPlaylistId: string;
}) {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < MAX_ANALYZE_VIDEOS) {
    const response = await input.youtube.playlistItems.list({
      part: ["contentDetails"],
      playlistId: input.uploadsPlaylistId,
      maxResults: PAGE_SIZE,
      pageToken,
    });

    for (const item of response.data.items ?? []) {
      const videoId = item.contentDetails?.videoId;

      if (videoId && !ids.includes(videoId)) {
        ids.push(videoId);
      }

      if (ids.length >= MAX_ANALYZE_VIDEOS) break;
    }

    pageToken = response.data.nextPageToken ?? undefined;

    if (!pageToken) break;
  }

  return ids;
}

async function fetchVideoDetails(input: {
  youtube: youtube_v3.Youtube;
  videoIds: string[];
  channelId: string;
  channelTitle: string;
  donorKind: FactoryDonorKind;
}) {
  const videos: SuperUploadVideo[] = [];

  for (let index = 0; index < input.videoIds.length; index += 50) {
    const batch = input.videoIds.slice(index, index + 50);

    const response = await input.youtube.videos.list({
      part: ["snippet", "statistics", "contentDetails", "status"],
      id: batch,
      maxResults: 50,
    });

    for (const item of response.data.items ?? []) {
      const videoId = item.id ?? "";

      if (!videoId) continue;
      if (item.status?.privacyStatus && item.status.privacyStatus !== "public") continue;

      const title = item.snippet?.title ?? `YouTube video ${videoId}`;
      const description = item.snippet?.description ?? "";
      const publishedAt = item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null;
      const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
      const views = toInt(item.statistics?.viewCount);
      const likes = toInt(item.statistics?.likeCount);
      const comments = toInt(item.statistics?.commentCount);
      const thumbnailUrl =
        item.snippet?.thumbnails?.maxres?.url ??
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null;

      const existing = await withDbRetry(() =>
        prisma.factorySourceVideo.findUnique({
          where: {
            sourceVideoId_sourceKind: {
              sourceVideoId: videoId,
              sourceKind: input.donorKind,
            },
          },
          select: {
            isUsed: true,
          },
        }),
      );

      const score = scoreSourceVideo({
        title,
        description,
        publishedAt,
        durationSeconds,
        views,
        likes,
        comments,
        isUsed: existing?.isUsed ?? false,
        donorKind: input.donorKind,
      });

      videos.push({
        sourceVideoId: videoId,
        sourceKind: input.donorKind,
        sourceUrl: getVideoUrl(videoId),
        channelId: input.channelId,
        channelTitle: input.channelTitle,
        title,
        description,
        thumbnailUrl,
        durationSeconds,
        publishedAt,
        views,
        likes,
        comments,
        ...score,
      });
    }
  }

  return videos;
}

export async function analyzeYoutubeSource(input: { sourceUrl: string; donorKind?: FactoryDonorKind }) {
  const donorKind = input.donorKind ?? SUPER_UPLOAD_DONOR_KIND;
  const youtube = await getYoutubeClient();
  const channelId = await resolveChannel({
    youtube,
    sourceUrl: input.sourceUrl,
  });

  const channel = await getUploadsPlaylistId({
    youtube,
    channelId,
  });

  const videoIds = await collectUploadVideoIds({
    youtube,
    uploadsPlaylistId: channel.uploadsPlaylistId,
  });

  const videos = await fetchVideoDetails({
    youtube,
    videoIds,
    channelId,
    channelTitle: channel.channelTitle,
    donorKind,
  });

  for (const video of videos) {
    await withDbRetry(() =>
      prisma.factorySourceVideo.upsert({
        where: {
          sourceVideoId_sourceKind: {
            sourceVideoId: video.sourceVideoId,
            sourceKind: donorKind,
          },
        },
        create: {
          ...video,
          sourceKind: donorKind,
        },
        update: {
          sourceUrl: video.sourceUrl,
          channelId: video.channelId,
          channelTitle: video.channelTitle,
          title: video.title,
          description: video.description,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds,
          publishedAt: video.publishedAt,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          viewsPerDay: video.viewsPerDay,
          likeRate: video.likeRate,
          commentRate: video.commentRate,
          sourceScore: video.sourceScore,
          viralChance: video.viralChance,
          suggestedClips: video.suggestedClips,
          suggestedHookMode: video.suggestedHookMode,
          suggestedWindow: video.suggestedWindow,
        },
      }),
    );
  }

  const storedVideos = await withDbRetry(() =>
    prisma.factorySourceVideo.findMany({
      where: {
        sourceKind: donorKind,
        sourceVideoId: {
          in: videos.map((video) => video.sourceVideoId),
        },
      },
      orderBy: [
        {
          isUsed: "asc",
        },
        {
          viralChance: "desc",
        },
        {
          viewsPerDay: "desc",
        },
      ],
    }),
  );

  return {
    channel: {
      id: channelId,
      title: channel.channelTitle,
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      viewCount: channel.viewCount,
      uploadsPlaylistId: channel.uploadsPlaylistId,
    },
    totalSeen: videos.length,
    videos: storedVideos,
    recommendations: buildSourceRecommendations(storedVideos),
  };
}

function buildSourceRecommendations(videos: Array<{
  viralChance: number;
  title: string;
  isUsed: boolean;
  suggestedClips: number;
  suggestedHookMode: string;
}>) {
  const available = videos.filter((video) => !video.isUsed);
  const best = available[0];

  if (!best) {
    return ["Р’СЃРµ РЅР°Р№РґРµРЅРЅС‹Рµ РІРёРґРµРѕ СѓР¶Рµ РѕС‚РјРµС‡РµРЅС‹ РёСЃРїРѕР»СЊР·РѕРІР°РЅРЅС‹РјРё. Р’РѕР·СЊРјРё РґСЂСѓРіРѕР№ РєР°РЅР°Р» РёР»Рё СЃРЅРёРјРё РѕС‚РјРµС‚РєСѓ СЃ РЅСѓР¶РЅРѕРіРѕ source video."];
  }

  const result = [
    `Р›СѓС‡С€РёР№ РєР°РЅРґРёРґР°С‚: "${best.title}" вЂ” С€Р°РЅСЃ ${best.viralChance}/100.`,
    `Р РµРєРѕРјРµРЅРґР°С†РёСЏ: СЃРґРµР»Р°С‚СЊ ${best.suggestedClips} РєР»РёРїРѕРІ, hook mode ${best.suggestedHookMode}, Р·Р°Р»РёРІ С‡РµСЂРµР· РІРµС‡РµСЂ/РЅРѕС‡СЊ New York РїРѕ Р°РЅР°Р»РёС‚РёРєРµ СЃ РЅРѕСЂРјР°Р»СЊРЅС‹Рј РёРЅС‚РµСЂРІР°Р»РѕРј 45вЂ“60 РјРёРЅСѓС‚.`,
  ];

  const hotCount = available.filter((video) => video.viralChance >= 75).length;

  if (hotCount > 0) {
    result.push(`РЎРёР»СЊРЅС‹С… source videos РЅР°Р№РґРµРЅРѕ: ${hotCount}. РќР°С‡РёРЅР°Р№ СЃ РІРµСЂС…РЅРёС…, РїРѕРІС‚РѕСЂС‹ РЅРµ Р±РµСЂРё.`);
  }

  return result;
}


export async function listSuperUploadDonors(input: { donorKind?: FactoryDonorKind } = {}) {
  const donorKind = input.donorKind ?? SUPER_UPLOAD_DONOR_KIND;

  return withDbRetry(() =>
    prisma.factoryDonorChannel.findMany({
      where: { donorKind },
      orderBy: [
        { isActive: "desc" },
        { createdAt: "desc" },
      ],
    }),
  );
}

export async function buildTodayCandidates(input: { limit?: number; donorKind?: FactoryDonorKind } = {}) {
  const limit = input.limit ?? 10;
  const donorKind = input.donorKind ?? SUPER_UPLOAD_DONOR_KIND;
  const donorIds = await withDbRetry(() =>
    prisma.factoryDonorChannel.findMany({
      where: { isActive: true, donorKind },
      select: { id: true, channelId: true },
    }),
  );

  const channelIds = donorIds.map((donor) => donor.channelId).filter(Boolean);
  const donorDbIds = donorIds.map((donor) => donor.id);
  const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

  const whereBase = {
    sourceKind: donorKind,
    isUsed: false,
    OR: [
      { donorChannelId: { in: donorDbIds } },
      { channelId: { in: channelIds } },
    ],
  };

  const fresh = await withDbRetry(() =>
    prisma.factorySourceVideo.findMany({
      where: {
        ...whereBase,
        publishedAt: { gte: since72h },
      },
      orderBy: [
        { viralChance: "desc" },
        { viewsPerDay: "desc" },
        { publishedAt: "desc" },
      ],
      take: limit,
    }),
  );

  if (fresh.length >= limit) return fresh;

  const fallback = await withDbRetry(() =>
    prisma.factorySourceVideo.findMany({
      where: whereBase,
      orderBy: [
        { viralChance: "desc" },
        { viewsPerDay: "desc" },
        { publishedAt: "desc" },
      ],
      take: limit,
    }),
  );

  return fallback;
}

export async function addSuperUploadDonor(input: { sourceUrl: string; donorKind?: FactoryDonorKind }) {
  const donorKind = input.donorKind ?? SUPER_UPLOAD_DONOR_KIND;
  const result = await analyzeYoutubeSource({ sourceUrl: input.sourceUrl, donorKind });

  const donor = await withDbRetry(() =>
    prisma.factoryDonorChannel.upsert({
      where: {
        channelId_donorKind: {
          channelId: result.channel.id,
          donorKind,
        },
      },
      create: {
        channelId: result.channel.id,
        donorKind,
        channelTitle: result.channel.title,
        sourceUrl: input.sourceUrl,
        uploadsPlaylistId: result.channel.uploadsPlaylistId,
        subscriberCount: BigInt(result.channel.subscriberCount),
        videoCount: BigInt(result.channel.videoCount),
        viewCount: BigInt(result.channel.viewCount),
        isActive: true,
        lastCheckedAt: new Date(),
        lastError: null,
      },
      update: {
        channelTitle: result.channel.title,
        sourceUrl: input.sourceUrl,
        uploadsPlaylistId: result.channel.uploadsPlaylistId,
        subscriberCount: BigInt(result.channel.subscriberCount),
        videoCount: BigInt(result.channel.videoCount),
        viewCount: BigInt(result.channel.viewCount),
        isActive: true,
        lastCheckedAt: new Date(),
        lastError: null,
      },
    }),
  );

  await withDbRetry(() =>
    prisma.factorySourceVideo.updateMany({
      where: {
        channelId: result.channel.id,
        sourceKind: donorKind,
      },
      data: {
        donorChannelId: donor.id,
      },
    }),
  );

  return {
    donor,
    analysis: result,
  };
}

export async function checkSuperUploadDonor(input: { donorId: string }) {
  const donor = await withDbRetry(() =>
    prisma.factoryDonorChannel.findUnique({
      where: { id: input.donorId },
    }),
  );

  if (!donor) {
    throw new Error("Donor channel РЅРµ РЅР°Р№РґРµРЅ");
  }

  try {
    const result = await analyzeYoutubeSource({ sourceUrl: donor.sourceUrl, donorKind: donor.donorKind });

    const updatedDonor = await withDbRetry(() =>
      prisma.factoryDonorChannel.update({
        where: { id: donor.id },
        data: {
          channelTitle: result.channel.title,
          uploadsPlaylistId: result.channel.uploadsPlaylistId,
          subscriberCount: BigInt(result.channel.subscriberCount),
          videoCount: BigInt(result.channel.videoCount),
          viewCount: BigInt(result.channel.viewCount),
          lastCheckedAt: new Date(),
          lastError: null,
        },
      }),
    );

    await withDbRetry(() =>
      prisma.factorySourceVideo.updateMany({
        where: {
          channelId: result.channel.id,
          sourceKind: donor.donorKind,
        },
        data: {
          donorChannelId: donor.id,
        },
      }),
    );

    return {
      donor: updatedDonor,
      analysis: result,
    };
  } catch (error) {
    await withDbRetry(() =>
      prisma.factoryDonorChannel.update({
        where: { id: donor.id },
        data: {
          lastCheckedAt: new Date(),
          lastError: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РґРѕРЅРѕСЂР°",
        },
      }),
    );

    throw error;
  }
}

export async function checkAllSuperUploadDonors(input: { donorKind?: FactoryDonorKind } = {}) {
  const donorKind = input.donorKind ?? SUPER_UPLOAD_DONOR_KIND;
  const donors = await withDbRetry(() =>
    prisma.factoryDonorChannel.findMany({
      where: { isActive: true, donorKind },
      orderBy: { createdAt: "asc" },
    }),
  );

  let checked = 0;
  const errors: Array<{ donorId: string; channelTitle: string; message: string }> = [];

  for (const donor of donors) {
    try {
      await checkSuperUploadDonor({ donorId: donor.id });
      checked += 1;
    } catch (error) {
      errors.push({
        donorId: donor.id,
        channelTitle: donor.channelTitle,
        message: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РґРѕРЅРѕСЂР°",
      });
    }
  }

  const candidates = await buildTodayCandidates({ limit: 10, donorKind });

  return {
    checked,
    errors,
    candidates,
  };
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
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

  return zonedAsUtc - date.getTime();
}

function zonedTimeToUtc(input: {
  timeZone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  const localAsUtc = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
  let utc = localAsUtc;

  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(utc), input.timeZone);
    utc = localAsUtc - offset;
  }

  return new Date(utc);
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function getBestAnalyticsHour() {
  return withDbRetry(async () => {
    const analyses = await prisma.factoryVideoAnalysis.findMany({
      where: {
        publish: {
          publishedAt: {
            not: null,
          },
        },
      },
      take: 300,
      orderBy: {
        viewsNow: "desc",
      },
      include: {
        publish: true,
      },
    });

    const byHour = new Map<number, { count: number; totalViews: number }>();

    for (const analysis of analyses) {
      if (!analysis.publish.publishedAt) continue;

      const ny = getTimeZoneParts(analysis.publish.publishedAt, NEW_YORK_TIME_ZONE);
      const row = byHour.get(ny.hour) ?? { count: 0, totalViews: 0 };
      row.count += 1;
      row.totalViews += analysis.views24h || analysis.viewsNow;
      byHour.set(ny.hour, row);
    }

    const best = Array.from(byHour.entries())
      .filter(([_hour, row]) => row.count >= 1)
      .map(([hour, row]) => ({
        hour,
        avgViews: row.totalViews / Math.max(1, row.count),
      }))
      .sort((a, b) => b.avgViews - a.avgViews)[0];

    return best?.hour ?? 22;
  });
}

function clampDaySlotsCount(clipsCount: number) {
  if (clipsCount <= 5) return clipsCount;
  if (clipsCount <= 10) return clipsCount;

  return 10;
}

function getWindowStartFromBestHour(bestHour: number) {
  if (bestHour >= 0 && bestHour <= 2) {
    return {
      hour: 18,
      minute: 30,
    };
  }

  if (bestHour >= 18 && bestHour <= 23) {
    const startHour = clamp(bestHour - 3, 18, 21);

    return {
      hour: startHour,
      minute: startHour === 18 ? 30 : 0,
    };
  }

  return {
    hour: 18,
    minute: 30,
  };
}

function getNextNewYorkDateForStart(input: {
  now: Date;
  startHour: number;
  startMinute: number;
}) {
  const ny = getTimeZoneParts(input.now, NEW_YORK_TIME_ZONE);
  const startToday = zonedTimeToUtc({
    timeZone: NEW_YORK_TIME_ZONE,
    year: ny.year,
    month: ny.month,
    day: ny.day,
    hour: input.startHour,
    minute: input.startMinute,
  });

  if (startToday.getTime() > input.now.getTime() + 10 * 60 * 1000) {
    return startToday;
  }

  return zonedTimeToUtc({
    timeZone: NEW_YORK_TIME_ZONE,
    year: ny.year,
    month: ny.month,
    day: ny.day + 1,
    hour: input.startHour,
    minute: input.startMinute,
  });
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export async function buildSuperUploadSchedule(input: {
  clipsCount: number;
  intervalMin: number;
  intervalMax: number;
  windowStartHour?: number | null;
  windowStartMinute?: number | null;
  windowEndHour?: number | null;
  windowEndMinute?: number | null;
  fitInsideWindow?: boolean | null;
}) {
  const bestHour = await getBestAnalyticsHour();
  const now = new Date();
  const clipsCount = clamp(Math.round(input.clipsCount), 1, 30);
  const intervalMin = clamp(Math.round(input.intervalMin), 5, 180);
  const intervalMax = clamp(Math.round(input.intervalMax), intervalMin, 240);
  const analyticsWindowStart = getWindowStartFromBestHour(bestHour);
  const windowStart = {
    hour: clamp(Math.round(input.windowStartHour ?? analyticsWindowStart.hour), 0, 23),
    minute: clamp(Math.round(input.windowStartMinute ?? analyticsWindowStart.minute), 0, 59),
  };
  const windowEnd = {
    hour: clamp(Math.round(input.windowEndHour ?? 1), 0, 23),
    minute: clamp(Math.round(input.windowEndMinute ?? 30), 0, 59),
  };
  const fitInsideWindow = input.fitInsideWindow ?? true;
  const firstStart = getNextNewYorkDateForStart({
    now,
    startHour: windowStart.hour,
    startMinute: windowStart.minute,
  });
  const firstStartNy = getTimeZoneParts(firstStart, NEW_YORK_TIME_ZONE);
  let windowEndDate = zonedTimeToUtc({
    timeZone: NEW_YORK_TIME_ZONE,
    year: firstStartNy.year,
    month: firstStartNy.month,
    day: firstStartNy.day,
    hour: windowEnd.hour,
    minute: windowEnd.minute,
  });

  if (windowEndDate.getTime() <= firstStart.getTime()) {
    windowEndDate = addCalendarDays(windowEndDate, 1);
  }

  const windowMinutes = Math.max(0, Math.floor((windowEndDate.getTime() - firstStart.getTime()) / 60_000));
  const slots: SuperUploadScheduleSlot[] = [];

  for (let index = 0; index < clipsCount; index += 1) {
    let minutesFromStart = 0;

    if (clipsCount > 1 && fitInsideWindow && windowMinutes > 0) {
      minutesFromStart = Math.round((windowMinutes * index) / (clipsCount - 1));
    } else {
      for (let stepIndex = 0; stepIndex < index; stepIndex += 1) {
        const range = Math.max(1, intervalMax - intervalMin + 1);
        minutesFromStart += intervalMin + (((index + stepIndex) * 11) % range);
      }
    }

    const scheduledAt = addMinutes(firstStart, minutesFromStart);
    const nySlot = getTimeZoneParts(scheduledAt, NEW_YORK_TIME_ZONE);

    slots.push({
      index: index + 1,
      scheduledAt,
      dayIndex: 1,
      localHour: nySlot.hour,
      localMinute: nySlot.minute,
      label: new Intl.DateTimeFormat("ru-RU", {
        timeZone: NEW_YORK_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(scheduledAt),
    });
  }

  return {
    bestHour,
    windowStart,
    windowEnd,
    perDay: clipsCount,
    windowMinutes,
    fitInsideWindow,
    slots,
  };
}
