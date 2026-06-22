import { NextResponse } from "next/server";

import { prisma } from "../../../../../lib/prisma";
import { withDbRetry } from "../../../../../lib/factory/db-retry";

export const runtime = "nodejs";

type Period = "day" | "week" | "month" | "all";

function getPeriod(request: Request): Period {
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "day";

  if (period === "day" || period === "week" || period === "month" || period === "all") {
    return period;
  }

  return "day";
}

function getPublishedAfter(period: Period) {
  if (period === "all") return null;

  const date = new Date();
  if (period === "day") date.setDate(date.getDate() - 1);
  if (period === "week") date.setDate(date.getDate() - 7);
  if (period === "month") date.setDate(date.getDate() - 30);

  return date;
}

function formatHourNy(date: Date | null | undefined) {
  if (!date) return "unknown";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function buildFallbackAnalysis(input: { period: Period; videos: any[] }) {
  const videos = input.videos;
  const total = videos.length;
  const dead = videos.filter((video) => video.verdict === "DEAD").length;
  const winners = videos.filter((video) => ["WINNER", "SCALE"].includes(video.verdict)).length;
  const avgViews = Math.round(videos.reduce((sum, video) => sum + video.viewsNow, 0) / Math.max(1, total));

  return [
    `AI fallback-анализ за период: ${input.period}.`,
    "",
    `Всего роликов: ${total}. Победители: ${winners}. Мертвые: ${dead}. Средние просмотры: ${avgViews}.`,
    "",
    "Жесткий вывод:",
    dead > winners
      ? "Большинство роликов не получает вторую волну. Нужно усиливать первые секунды, уникальность title и hook-preview."
      : "Есть рабочие связки. Их нужно повторять похожими пакетами, но не копировать title один в один.",
    "",
    "План следующего залива:",
    "1. Использовать AI Hook Cut с hook-preview 8–10 сек.",
    "2. Запретить одинаковые title внутри пакета.",
    "3. Тестировать 45 сек против 60 сек.",
    "4. Использовать разные Amelia-шаблоны, чтобы не было визуального клонирования.",
    "5. Лить в лучшее вечерне-ночное окно New York с интервалом 45–60 минут.",
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const period = getPeriod(request);
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
        orderBy: [{ lastCheckedAt: "desc" }, { viewsNow: "desc" }],
        take: 120,
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

    const videos = analyses.map((item) => ({
      title: item.publish.title ?? item.clip.title,
      url: item.publish.platformUrl,
      viewsNow: item.viewsNow,
      views1h: item.views1h,
      views3h: item.views3h,
      views6h: item.views6h,
      views24h: item.views24h,
      likesNow: item.likesNow,
      commentsNow: item.commentsNow,
      sharesNow: item.sharesNow,
      avgViewDuration: item.averageViewDuration24h,
      avgViewPercentage: item.averageViewPercentage24h,
      score: item.factoryScore,
      verdict: item.verdict,
      velocityType: item.velocityType,
      recommendation: item.recommendation,
      clipSeconds: item.clip.job.clipSeconds,
      cutMode: item.clip.job.cutMode,
      hookPreviewSeconds: item.clip.job.hookPreviewSeconds,
      template: item.publish.target?.template?.name ?? "No template",
      account: item.account?.name ?? item.publish.account?.name ?? "unknown",
      uploadTimeNy: formatHourNy(item.publish.publishedAt),
      publishedAt: item.publish.publishedAt,
    }));

    if (videos.length === 0) {
      return NextResponse.json({
        period,
        analysis: "За выбранный период нет опубликованных роликов с аналитикой. Запусти analytics-worker и дождись метрик.",
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        period,
        analysis: buildFallbackAnalysis({ period, videos }),
      });
    }

    const prompt = [
      "Ты профессиональный YouTube Shorts growth strategist, retention analyst и Roblox Shorts strategist.",
      "Твоя задача — жестко проанализировать контент-фабрику и сказать, что масштабировать, что запретить и что тестировать дальше.",
      "Не пиши воду. Давай конкретные решения.",
      "Обязательно анализируй: first wave vs second wave, title uniqueness, hook types, clip length, Amelia template, upload time New York, retention, likes/comments, dead ролики.",
      "Верни структурированный ответ на русском:",
      "1. Главный диагноз",
      "2. Что сработало",
      "3. Что убивает рост",
      "4. Какие title/hooks повторять и какие запретить",
      "5. Лучшие настройки следующего пакета",
      "6. План на завтра из 5-10 конкретных действий",
      `Период: ${period}`,
      "Данные роликов JSON:",
      JSON.stringify(videos.slice(0, 80)),
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ANALYTICS_MODEL ?? "gpt-4.1-mini",
        temperature: 0.25,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI analytics failed: ${response.status} ${body.slice(0, 1000)}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    return NextResponse.json({
      period,
      analysis: data.choices?.[0]?.message?.content ?? buildFallbackAnalysis({ period, videos }),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не получилось выполнить AI-анализ",
      },
      { status: 500 },
    );
  }
}
