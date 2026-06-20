import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";

export const runtime = "nodejs";

function avg(values: number[]) {
  if (values.length === 0) return 0;

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatHour(date: Date | null | undefined) {
  if (!date) return "unknown";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function getHookType(title: string | null | undefined) {
  const normalized = (title ?? "").toLowerCase();

  if (
    normalized.includes("wait for the ending") ||
    normalized.includes("nobody expected") ||
    normalized.includes("ending") ||
    normalized.includes("last second") ||
    normalized.includes("final jump") ||
    normalized.includes("final move")
  ) {
    return "Ending hook";
  }

  if (
    normalized.includes("survived") ||
    normalized.includes("survive") ||
    normalized.includes("stayed alive") ||
    normalized.includes("escape") ||
    normalized.includes("one second left") ||
    normalized.includes("no hp") ||
    normalized.includes("one heart")
  ) {
    return "Survival hook";
  }

  if (
    normalized.includes("impossible") ||
    normalized.includes("too hard") ||
    normalized.includes("illegal") ||
    normalized.includes("unfair") ||
    normalized.includes("rage quit") ||
    normalized.includes("breaks most players") ||
    normalized.includes("made to make people quit")
  ) {
    return "Impossible hook";
  }

  if (
    normalized.includes("fail") ||
    normalized.includes("mistake") ||
    normalized.includes("lost it") ||
    normalized.includes("painful") ||
    normalized.includes("threw") ||
    normalized.includes("fall was brutal") ||
    normalized.includes("worst moment") ||
    normalized.includes("worst timing")
  ) {
    return "Fail hook";
  }

  if (
    normalized.includes("no way") ||
    normalized.includes("i thought") ||
    normalized.includes("too close") ||
    normalized.includes("watch what happens") ||
    normalized.includes("did not expect") ||
    normalized.includes("stressful") ||
    normalized.includes("timing here")
  ) {
    return "Suspense hook";
  }

  if (
    normalized.includes("only roblox pros") ||
    normalized.includes("only pros") ||
    normalized.includes("most players") ||
    normalized.includes("can you") ||
    normalized.includes("could you") ||
    normalized.includes("try not to blink") ||
    normalized.includes("one percent") ||
    normalized.includes("separates pros")
  ) {
    return "Challenge hook";
  }

  if (
    normalized.includes("physics") ||
    normalized.includes("bro ") ||
    normalized.includes("dumbest") ||
    normalized.includes("panicked") ||
    normalized.includes("random") ||
    normalized.includes("not supposed") ||
    normalized.includes("chose violence") ||
    normalized.includes("pure chaos")
  ) {
    return "Funny hook";
  }

  if (
    normalized.includes("crazy") ||
    normalized.includes("insane") ||
    normalized.includes("chaos") ||
    normalized.includes("wild")
  ) {
    return "Crazy / chaos";
  }

  if (normalized.includes("roblox")) return "Roblox direct";

  return "Other";
}

function groupBy<T>(items: T[], keyGetter: (item: T) => string) {
  const map = new Map<string, T[]>();

  for (const item of items) {
    const key = keyGetter(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }

  return map;
}

function summarizeGroup<T>(
  items: T[],
  options: {
    label: string;
    getViews: (item: T) => number;
    getScore: (item: T) => number;
    getWinner: (item: T) => boolean;
  },
) {
  return {
    label: options.label,
    count: items.length,
    avgViews24h: avg(items.map(options.getViews)),
    avgScore: avg(items.map(options.getScore)),
    winRate: Math.round(
      (items.filter(options.getWinner).length / Math.max(1, items.length)) *
        100,
    ),
  };
}

function getAnalyticsPeriod(request: Request) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "month";

  if (period === "day" || period === "week" || period === "month" || period === "all") {
    return period;
  }

  return "month";
}

function getPublishedAfter(period: string) {
  if (period === "all") return null;

  const date = new Date();

  if (period === "day") {
    date.setDate(date.getDate() - 1);
    return date;
  }

  if (period === "week") {
    date.setDate(date.getDate() - 7);
    return date;
  }

  date.setDate(date.getDate() - 30);
  return date;
}

export async function GET(request: Request) {
  try {
    const period = getAnalyticsPeriod(request);
    const publishedAfter = getPublishedAfter(period);

    const analyses = await withDbRetry(() =>
      prisma.factoryVideoAnalysis.findMany({
        where: {
          publish: {
            is: {
              status: "PUBLISHED",
              ...(publishedAfter
                ? {
                    publishedAt: {
                      gte: publishedAfter,
                    },
                  }
                : {}),
            },
          },
        },
        orderBy: [
          {
            factoryScore: "desc",
          },
          {
            viewsNow: "desc",
          },
        ],
        take: 300,
        include: {
          publish: {
            include: {
              target: {
                include: {
                  template: true,
                },
              },
              account: true,
            },
          },
          clip: {
            include: {
              job: true,
            },
          },
          account: true,
        },
      }),
    );

    const totalVideos = analyses.length;
    const winners = analyses.filter((item) =>
      ["WINNER", "SCALE"].includes(item.verdict),
    );
    const dead = analyses.filter((item) => item.verdict === "DEAD");
    const totalViewsNow = sum(analyses.map((item) => item.viewsNow));
    const avgScore = avg(analyses.map((item) => item.factoryScore));
    const avgRetention = Math.round(
      analyses.reduce(
        (total, item) => total + item.averageViewPercentage24h,
        0,
      ) / Math.max(1, analyses.length),
    );

    const byTime = Array.from(
      groupBy(analyses, (item) => formatHour(item.publish.publishedAt)).entries(),
    )
      .map(([label, items]) =>
        summarizeGroup(items, {
          label,
          getViews: (item) => item.views24h || item.viewsNow,
          getScore: (item) => item.factoryScore,
          getWinner: (item) => ["WINNER", "SCALE"].includes(item.verdict),
        }),
      )
      .sort((a, b) => b.avgViews24h - a.avgViews24h);

    const byGame = Array.from(
      groupBy(analyses, (item) => item.clip.job.game).entries(),
    )
      .map(([label, items]) =>
        summarizeGroup(items, {
          label,
          getViews: (item) => item.views24h || item.viewsNow,
          getScore: (item) => item.factoryScore,
          getWinner: (item) => ["WINNER", "SCALE"].includes(item.verdict),
        }),
      )
      .sort((a, b) => b.avgViews24h - a.avgViews24h);

    const byTemplate = Array.from(
      groupBy(
        analyses,
        (item) => item.publish.target?.template?.name ?? "No template",
      ).entries(),
    )
      .map(([label, items]) =>
        summarizeGroup(items, {
          label,
          getViews: (item) => item.views24h || item.viewsNow,
          getScore: (item) => item.factoryScore,
          getWinner: (item) => ["WINNER", "SCALE"].includes(item.verdict),
        }),
      )
      .sort((a, b) => b.avgViews24h - a.avgViews24h);

    const byLength = Array.from(
      groupBy(analyses, (item) => `${item.clip.job.clipSeconds} sec`).entries(),
    )
      .map(([label, items]) =>
        summarizeGroup(items, {
          label,
          getViews: (item) => item.views24h || item.viewsNow,
          getScore: (item) => item.factoryScore,
          getWinner: (item) => ["WINNER", "SCALE"].includes(item.verdict),
        }),
      )
      .sort((a, b) => b.avgViews24h - a.avgViews24h);

    const byHook = Array.from(
      groupBy(analyses, (item) =>
        getHookType(item.publish.title ?? item.clip.title),
      ).entries(),
    )
      .map(([label, items]) =>
        summarizeGroup(items, {
          label,
          getViews: (item) => item.views24h || item.viewsNow,
          getScore: (item) => item.factoryScore,
          getWinner: (item) => ["WINNER", "SCALE"].includes(item.verdict),
        }),
      )
      .sort((a, b) => b.avgViews24h - a.avgViews24h);

    const topVideos = analyses.slice(0, 30).map((item) => ({
      id: item.id,
      publishId: item.publishId,
      videoId: item.platformVideoId,
      url: item.publish.platformUrl,
      title: item.publish.title ?? item.clip.title,
      accountName: item.account?.name ?? item.publish.account?.name ?? "—",
      game: item.clip.job.game,
      templateName: item.publish.target?.template?.name ?? "—",
      clipSeconds: item.clip.job.clipSeconds,
      publishedAt: item.publish.publishedAt,
      uploadTimeNy: formatHour(item.publish.publishedAt),
      viewsNow: item.viewsNow,
      views1h: item.views1h,
      views3h: item.views3h,
      views6h: item.views6h,
      views24h: item.views24h,
      views48h: item.views48h,
      likesNow: item.likesNow,
      commentsNow: item.commentsNow,
      sharesNow: item.sharesNow,
      averageViewDuration24h: item.averageViewDuration24h,
      averageViewPercentage24h: item.averageViewPercentage24h,
      estimatedMinutesWatched24h: item.estimatedMinutesWatched24h,
      subscribersGained24h: item.subscribersGained24h,
      factoryScore: item.factoryScore,
      velocityType: item.velocityType,
      verdict: item.verdict,
      recommendation: item.recommendation,
      lastCheckedAt: item.lastCheckedAt,
    }));

    const failedVideos = analyses
      .filter((item) => item.verdict === "DEAD")
      .sort((a, b) => a.viewsNow - b.viewsNow)
      .slice(0, 40)
      .map((item) => ({
        id: item.id,
        publishId: item.publishId,
        videoId: item.platformVideoId,
        url: item.publish.platformUrl,
        title: item.publish.title ?? item.clip.title,
        accountName: item.account?.name ?? item.publish.account?.name ?? "—",
        game: item.clip.job.game,
        templateName: item.publish.target?.template?.name ?? "—",
        clipSeconds: item.clip.job.clipSeconds,
        uploadTimeNy: formatHour(item.publish.publishedAt),
        viewsNow: item.viewsNow,
        factoryScore: item.factoryScore,
        recommendation: item.recommendation,
      }));

    const recommendations = [];
    const bestTime = byTime[0];
    const bestTemplate = byTemplate[0];
    const bestLength = byLength[0];
    const bestHook = byHook[0];

    if (bestTime) {
      recommendations.push(
        `Лучшее окно сейчас: ${bestTime.label} New York, среднее ${bestTime.avgViews24h} views / 24h.`,
      );
    }

    if (bestTemplate) {
      recommendations.push(
        `Лучший шаблон: ${bestTemplate.label}, win rate ${bestTemplate.winRate}%.`,
      );
    }

    if (bestLength) {
      recommendations.push(
        `Лучшая длина: ${bestLength.label}, среднее ${bestLength.avgViews24h} views / 24h.`,
      );
    }

    if (bestHook) {
      recommendations.push(
        `Лучший hook: ${bestHook.label}, win rate ${bestHook.winRate}%.`,
      );
    }

    if (winners.length > 0) {
      recommendations.push(
        `Есть ${winners.length} победителей. Их нужно повторять похожими пакетами, а слабые связки не масштабировать.`,
      );
    }

    return NextResponse.json({
      period,
      publishedAfter,
      summary: {
        totalVideos,
        winners: winners.length,
        dead: dead.length,
        totalViewsNow,
        avgScore,
        avgRetention,
      },
      topVideos,
      failedVideos,
      groups: {
        byTime,
        byGame,
        byTemplate,
        byLength,
        byHook,
      },
      recommendations,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить аналитику",
      },
      {
        status: 500,
      },
    );
  }
}
