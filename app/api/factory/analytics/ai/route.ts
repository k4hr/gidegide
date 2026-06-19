import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";

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
    timeZone: "Europe/Moscow",
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
    `AI fallback-Р°РЅР°Р»РёР· Р·Р° РїРµСЂРёРѕРґ: ${input.period}.`,
    "",
    `Р’СЃРµРіРѕ СЂРѕР»РёРєРѕРІ: ${total}. РџРѕР±РµРґРёС‚РµР»Рё: ${winners}. РњРµСЂС‚РІС‹Рµ: ${dead}. РЎСЂРµРґРЅРёРµ РїСЂРѕСЃРјРѕС‚СЂС‹: ${avgViews}.`,
    "",
    "Р–РµСЃС‚РєРёР№ РІС‹РІРѕРґ:",
    dead > winners
      ? "Р‘РѕР»СЊС€РёРЅСЃС‚РІРѕ СЂРѕР»РёРєРѕРІ РЅРµ РїРѕР»СѓС‡Р°РµС‚ РІС‚РѕСЂСѓСЋ РІРѕР»РЅСѓ. РќСѓР¶РЅРѕ СѓСЃРёР»РёРІР°С‚СЊ РїРµСЂРІС‹Рµ СЃРµРєСѓРЅРґС‹, СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚СЊ title Рё hook-preview."
      : "Р•СЃС‚СЊ СЂР°Р±РѕС‡РёРµ СЃРІСЏР·РєРё. РС… РЅСѓР¶РЅРѕ РїРѕРІС‚РѕСЂСЏС‚СЊ РїРѕС…РѕР¶РёРјРё РїР°РєРµС‚Р°РјРё, РЅРѕ РЅРµ РєРѕРїРёСЂРѕРІР°С‚СЊ title РѕРґРёРЅ РІ РѕРґРёРЅ.",
    "",
    "РџР»Р°РЅ СЃР»РµРґСѓСЋС‰РµРіРѕ Р·Р°Р»РёРІР°:",
    "1. РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ AI Hook Cut СЃ hook-preview 8вЂ“10 СЃРµРє.",
    "2. Р—Р°РїСЂРµС‚РёС‚СЊ РѕРґРёРЅР°РєРѕРІС‹Рµ title РІРЅСѓС‚СЂРё РїР°РєРµС‚Р°.",
    "3. РўРµСЃС‚РёСЂРѕРІР°С‚СЊ 45 СЃРµРє РїСЂРѕС‚РёРІ 60 СЃРµРє.",
    "4. РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ СЂР°Р·РЅС‹Рµ Amelia-С€Р°Р±Р»РѕРЅС‹, С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ РІРёР·СѓР°Р»СЊРЅРѕРіРѕ РєР»РѕРЅРёСЂРѕРІР°РЅРёСЏ.",
    "5. Р›РёС‚СЊ РІ Р»СѓС‡С€РµРµ РІРµС‡РµСЂРЅРµ-РЅРѕС‡РЅРѕРµ РѕРєРЅРѕ New York СЃ РёРЅС‚РµСЂРІР°Р»РѕРј 45вЂ“60 РјРёРЅСѓС‚.",
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
        analysis: "Р—Р° РІС‹Р±СЂР°РЅРЅС‹Р№ РїРµСЂРёРѕРґ РЅРµС‚ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅС‹С… СЂРѕР»РёРєРѕРІ СЃ Р°РЅР°Р»РёС‚РёРєРѕР№. Р—Р°РїСѓСЃС‚Рё analytics-worker Рё РґРѕР¶РґРёСЃСЊ РјРµС‚СЂРёРє.",
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
      "РўС‹ РїСЂРѕС„РµСЃСЃРёРѕРЅР°Р»СЊРЅС‹Р№ YouTube Shorts growth strategist, retention analyst Рё Roblox Shorts strategist.",
      "РўРІРѕСЏ Р·Р°РґР°С‡Р° вЂ” Р¶РµСЃС‚РєРѕ РїСЂРѕР°РЅР°Р»РёР·РёСЂРѕРІР°С‚СЊ РєРѕРЅС‚РµРЅС‚-С„Р°Р±СЂРёРєСѓ Рё СЃРєР°Р·Р°С‚СЊ, С‡С‚Рѕ РјР°СЃС€С‚Р°Р±РёСЂРѕРІР°С‚СЊ, С‡С‚Рѕ Р·Р°РїСЂРµС‚РёС‚СЊ Рё С‡С‚Рѕ С‚РµСЃС‚РёСЂРѕРІР°С‚СЊ РґР°Р»СЊС€Рµ.",
      "РќРµ РїРёС€Рё РІРѕРґСѓ. Р”Р°РІР°Р№ РєРѕРЅРєСЂРµС‚РЅС‹Рµ СЂРµС€РµРЅРёСЏ.",
      "РћР±СЏР·Р°С‚РµР»СЊРЅРѕ Р°РЅР°Р»РёР·РёСЂСѓР№: first wave vs second wave, title uniqueness, hook types, clip length, Amelia template, upload time New York, retention, likes/comments, dead СЂРѕР»РёРєРё.",
      "Р’РµСЂРЅРё СЃС‚СЂСѓРєС‚СѓСЂРёСЂРѕРІР°РЅРЅС‹Р№ РѕС‚РІРµС‚ РЅР° СЂСѓСЃСЃРєРѕРј:",
      "1. Р“Р»Р°РІРЅС‹Р№ РґРёР°РіРЅРѕР·",
      "2. Р§С‚Рѕ СЃСЂР°Р±РѕС‚Р°Р»Рѕ",
      "3. Р§С‚Рѕ СѓР±РёРІР°РµС‚ СЂРѕСЃС‚",
      "4. РљР°РєРёРµ title/hooks РїРѕРІС‚РѕСЂСЏС‚СЊ Рё РєР°РєРёРµ Р·Р°РїСЂРµС‚РёС‚СЊ",
      "5. Р›СѓС‡С€РёРµ РЅР°СЃС‚СЂРѕР№РєРё СЃР»РµРґСѓСЋС‰РµРіРѕ РїР°РєРµС‚Р°",
      "6. РџР»Р°РЅ РЅР° Р·Р°РІС‚СЂР° РёР· 5-10 РєРѕРЅРєСЂРµС‚РЅС‹С… РґРµР№СЃС‚РІРёР№",
      `РџРµСЂРёРѕРґ: ${period}`,
      "Р”Р°РЅРЅС‹Рµ СЂРѕР»РёРєРѕРІ JSON:",
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
        error: error instanceof Error ? error.message : "РќРµ РїРѕР»СѓС‡РёР»РѕСЃСЊ РІС‹РїРѕР»РЅРёС‚СЊ AI-Р°РЅР°Р»РёР·",
      },
      { status: 500 },
    );
  }
}
