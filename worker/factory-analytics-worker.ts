import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import {
  fetchYoutubeBasicVideoStats,
  fetchYoutubeDeepVideoStats,
} from "@/lib/factory/youtube-analytics";

const CHECK_INTERVAL_MS = Number(
  process.env.FACTORY_ANALYTICS_INTERVAL_MS ?? 1000 * 60 * 30,
);

const LOOKBACK_DAYS = Number(process.env.FACTORY_ANALYTICS_LOOKBACK_DAYS ?? 14);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function db<T>(operation: () => Promise<T>) {
  return withDbRetry(operation, 5);
}

function getAgeMinutes(publishedAt: Date | null | undefined) {
  if (!publishedAt) return 0;

  return Math.max(0, Math.round((Date.now() - publishedAt.getTime()) / 60000));
}

function pickClosestMetric<T extends { ageMinutes: number }>(
  metrics: T[],
  targetMinutes: number,
) {
  if (metrics.length === 0) return null;

  const olderOrEqual = metrics
    .filter((metric) => metric.ageMinutes <= targetMinutes)
    .sort((a, b) => b.ageMinutes - a.ageMinutes)[0];

  if (olderOrEqual) return olderOrEqual;

  return [...metrics].sort(
    (a, b) =>
      Math.abs(a.ageMinutes - targetMinutes) -
      Math.abs(b.ageMinutes - targetMinutes),
  )[0];
}

function getVelocityType(input: {
  views1h: number;
  views3h: number;
  views6h: number;
  views24h: number;
  views48h: number;
}) {
  if (input.views24h >= 50000 || input.views48h >= 90000) return "VIRAL";
  if (input.views6h >= 10000 || input.views24h >= 25000) return "FAST_SPIKE";
  if (input.views1h < 100 && input.views24h >= 8000) return "SLOW_BURN";
  if (input.views24h >= 8000) return "STABLE_GROWTH";
  if (input.views6h < 300 && input.views24h < 1000) return "DEAD_ON_ARRIVAL";

  return "NORMAL";
}

function scoreViews24h(views24h: number) {
  if (views24h >= 50000) return 35;
  if (views24h >= 25000) return 31;
  if (views24h >= 10000) return 25;
  if (views24h >= 5000) return 18;
  if (views24h >= 1500) return 11;
  if (views24h >= 500) return 6;

  return 0;
}

function scoreVelocity(input: {
  views1h: number;
  views3h: number;
  views6h: number;
}) {
  if (
    input.views1h >= 1000 ||
    input.views3h >= 4000 ||
    input.views6h >= 10000
  ) {
    return 20;
  }

  if (
    input.views1h >= 500 ||
    input.views3h >= 2000 ||
    input.views6h >= 5000
  ) {
    return 15;
  }

  if (
    input.views1h >= 150 ||
    input.views3h >= 800 ||
    input.views6h >= 2000
  ) {
    return 10;
  }

  if (
    input.views1h >= 50 ||
    input.views3h >= 250 ||
    input.views6h >= 700
  ) {
    return 5;
  }

  return 0;
}

function scoreRetention(averageViewPercentage: number) {
  if (averageViewPercentage >= 95) return 20;
  if (averageViewPercentage >= 80) return 17;
  if (averageViewPercentage >= 65) return 13;
  if (averageViewPercentage >= 50) return 8;
  if (averageViewPercentage >= 35) return 4;

  return 0;
}

function scoreEngagement(input: {
  views: number;
  likes: number;
  comments: number;
  subscribersGained: number;
}) {
  const views = Math.max(1, input.views);
  const likeRate = input.likes / views;
  const commentRate = input.comments / views;
  const subscriberRate = input.subscribersGained / views;

  let score = 0;

  if (likeRate >= 0.06) score += 5;
  else if (likeRate >= 0.035) score += 4;
  else if (likeRate >= 0.02) score += 3;
  else if (likeRate >= 0.01) score += 1;

  if (commentRate >= 0.01) score += 3;
  else if (commentRate >= 0.004) score += 2;
  else if (commentRate >= 0.0015) score += 1;

  if (subscriberRate >= 0.005) score += 7;
  else if (subscriberRate >= 0.002) score += 5;
  else if (subscriberRate >= 0.0008) score += 3;
  else if (input.subscribersGained > 0) score += 1;

  return Math.min(15, score);
}

function buildVerdict(input: {
  score: number;
  ageMinutes: number;
  views24h: number;
}) {
  if (input.ageMinutes < 180) return "WAITING";
  if (input.score >= 82 || input.views24h >= 50000) return "SCALE";
  if (input.score >= 68 || input.views24h >= 15000) return "WINNER";
  if (input.score >= 45 || input.views24h >= 4000) return "TEST_MORE";

  return "DEAD";
}

function buildRecommendation(input: {
  verdict: string;
  velocityType: string;
  views24h: number;
  averageViewPercentage24h: number;
}) {
  if (input.verdict === "SCALE") {
    return "Масштабировать: сделать похожие Roblox-клипы с тем же шаблоном и похожим hook в лучшие USA-слоты.";
  }

  if (input.verdict === "WINNER") {
    return "Победитель: добавить формат в тестовую пачку и проверить еще 5–10 похожих роликов.";
  }

  if (input.verdict === "TEST_MORE") {
    return "Средний результат: повторить с другой длиной или другим title hook, но не увеличивать объем резко.";
  }

  if (input.verdict === "DEAD") {
    return "Не масштабировать: слабый старт. Проверь source, первый кадр, длину и время публикации.";
  }

  return "Ждем данные: глубокая YouTube Analytics статистика может догонять с задержкой.";
}

async function recomputeAnalysis(publishId: string) {
  const publish = await db(() =>
    prisma.factoryPublish.findUnique({
      where: {
        id: publishId,
      },
      include: {
        clip: {
          include: {
            job: true,
          },
        },
        account: true,
        videoMetrics: {
          orderBy: {
            checkedAt: "asc",
          },
        },
      },
    }),
  );

  if (!publish || publish.videoMetrics.length === 0 || !publish.platformPostId) {
    return;
  }

  const latest = publish.videoMetrics[publish.videoMetrics.length - 1];

  const metric1h = pickClosestMetric(publish.videoMetrics, 60);
  const metric3h = pickClosestMetric(publish.videoMetrics, 180);
  const metric6h = pickClosestMetric(publish.videoMetrics, 360);
  const metric24h = pickClosestMetric(publish.videoMetrics, 1440);
  const metric48h = pickClosestMetric(publish.videoMetrics, 2880);

  const views1h = metric1h?.views ?? 0;
  const views3h = metric3h?.views ?? 0;
  const views6h = metric6h?.views ?? 0;
  const views24h = metric24h?.views ?? latest.views;
  const views48h = metric48h?.views ?? latest.views;

  const likes24h = metric24h?.likes ?? latest.likes;
  const comments24h = metric24h?.comments ?? latest.comments;
  const shares24h = metric24h?.shares ?? latest.shares;
  const subscribersGained24h =
    metric24h?.subscribersGained ?? latest.subscribersGained;
  const subscribersLost24h =
    metric24h?.subscribersLost ?? latest.subscribersLost;
  const estimatedMinutesWatched24h =
    metric24h?.estimatedMinutesWatched ?? latest.estimatedMinutesWatched;
  const averageViewDuration24h =
    metric24h?.averageViewDuration ?? latest.averageViewDuration;
  const averageViewPercentage24h =
    metric24h?.averageViewPercentage ?? latest.averageViewPercentage;

  const likeRate = latest.views > 0 ? latest.likes / latest.views : 0;
  const commentRate = latest.views > 0 ? latest.comments / latest.views : 0;
  const subscriberRate =
    latest.views > 0 ? latest.subscribersGained / latest.views : 0;

  const score = Math.max(
    0,
    Math.min(
      100,
      scoreViews24h(views24h) +
        scoreVelocity({
          views1h,
          views3h,
          views6h,
        }) +
        scoreRetention(averageViewPercentage24h) +
        Math.min(10, Math.round(estimatedMinutesWatched24h / 100)) +
        scoreEngagement({
          views: latest.views,
          likes: latest.likes,
          comments: latest.comments,
          subscribersGained: latest.subscribersGained,
        }),
    ),
  );

  const velocityType = getVelocityType({
    views1h,
    views3h,
    views6h,
    views24h,
    views48h,
  });

  const verdict = buildVerdict({
    score,
    ageMinutes: latest.ageMinutes,
    views24h,
  });

  const recommendation = buildRecommendation({
    verdict,
    velocityType,
    views24h,
    averageViewPercentage24h,
  });

  await db(() =>
    prisma.factoryVideoAnalysis.upsert({
      where: {
        publishId: publish.id,
      },
      create: {
        publishId: publish.id,
        clipId: publish.clipId,
        accountId: publish.accountId,
        platform: publish.platform,
        platformVideoId: publish.platformPostId,
        viewsNow: latest.views,
        views1h,
        views3h,
        views6h,
        views24h,
        views48h,
        likesNow: latest.likes,
        commentsNow: latest.comments,
        sharesNow: latest.shares,
        likes24h,
        comments24h,
        shares24h,
        subscribersGained24h,
        subscribersLost24h,
        estimatedMinutesWatched24h,
        averageViewDuration24h,
        averageViewPercentage24h,
        likeRate,
        commentRate,
        subscriberRate,
        factoryScore: score,
        velocityType,
        verdict,
        recommendation,
        lastCheckedAt: latest.checkedAt,
      },
      update: {
        accountId: publish.accountId,
        viewsNow: latest.views,
        views1h,
        views3h,
        views6h,
        views24h,
        views48h,
        likesNow: latest.likes,
        commentsNow: latest.comments,
        sharesNow: latest.shares,
        likes24h,
        comments24h,
        shares24h,
        subscribersGained24h,
        subscribersLost24h,
        estimatedMinutesWatched24h,
        averageViewDuration24h,
        averageViewPercentage24h,
        likeRate,
        commentRate,
        subscriberRate,
        factoryScore: score,
        velocityType,
        verdict,
        recommendation,
        lastCheckedAt: latest.checkedAt,
      },
    }),
  );
}

async function collectAnalyticsOnce() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const publishes = await db(() =>
    prisma.factoryPublish.findMany({
      where: {
        platform: "YOUTUBE",
        status: "PUBLISHED",
        platformPostId: {
          not: null,
        },
        OR: [
          {
            publishedAt: {
              gte: since,
            },
          },
          {
            publishedAt: null,
          },
          {
            updatedAt: {
              gte: since,
            },
          },
        ],
      },
      include: {
        account: true,
        clip: {
          include: {
            job: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 500,
    }),
  );

  const byAccount = new Map<string, typeof publishes>();

  for (const publish of publishes) {
    if (!publish.account || !publish.platformPostId) continue;

    const list = byAccount.get(publish.account.id) ?? [];
    list.push(publish);
    byAccount.set(publish.account.id, list);
  }

  let checked = 0;

  for (const accountPublishes of byAccount.values()) {
    const account = accountPublishes[0]?.account;

    if (!account) continue;

    const videoIds = accountPublishes
      .map((publish) => publish.platformPostId)
      .filter(Boolean) as string[];

    const basicStats = await fetchYoutubeBasicVideoStats({
      account,
      videoIds,
    });

    for (const publish of accountPublishes) {
      if (!publish.platformPostId) continue;

      const basic = basicStats.get(publish.platformPostId);

      if (!basic) continue;

      const publishedAt =
        publish.publishedAt ?? basic.publishedAt ?? publish.updatedAt;

      const deep = await fetchYoutubeDeepVideoStats({
        account,
        videoId: publish.platformPostId,
        publishedAt,
      });

      await db(() =>
        prisma.factoryPublish.update({
          where: {
            id: publish.id,
          },
          data: {
            title: publish.title ?? basic.title,
            description: publish.description ?? basic.description,
            publishedAt,
          },
        }),
      );

      await db(() =>
        prisma.factoryVideoMetric.create({
          data: {
            publishId: publish.id,
            clipId: publish.clipId,
            accountId: publish.accountId,
            platform: publish.platform,
            platformVideoId: publish.platformPostId,
            views: basic.views,
            likes: basic.likes,
            comments: basic.comments,
            shares: deep.shares,
            estimatedMinutesWatched: deep.estimatedMinutesWatched,
            averageViewDuration: deep.averageViewDuration,
            averageViewPercentage: deep.averageViewPercentage,
            subscribersGained: deep.subscribersGained,
            subscribersLost: deep.subscribersLost,
            ageMinutes: getAgeMinutes(publishedAt),
          },
        }),
      );

      await recomputeAnalysis(publish.id);
      checked += 1;
    }
  }

  console.log(`Analytics checked ${checked} YouTube publishes`);
}

async function main() {
  console.log("Factory analytics worker started");

  while (true) {
    try {
      await collectAnalyticsOnce();
    } catch (error) {
      console.error("Factory analytics worker error:", error);
    }

    await sleep(CHECK_INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
