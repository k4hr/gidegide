import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import { buildSuperUploadSchedule, buildTodayCandidates, listSuperUploadDonors, STORY_SHORTS_DONOR_KIND } from "@/lib/factory/super-upload";
import { getViralBrainContext, selectBestFormulaForSource } from "@/lib/factory/viral-lab";

export const runtime = "nodejs";

const bodySchema = z.object({
  accountId: z.string().min(1),
  candidatesCount: z.coerce.number().int().min(1).max(50).default(10),
  storyStyle: z.string().trim().min(1).default("AUTO"),
  storyMinSeconds: z.coerce.number().int().min(10).max(30).default(10),
  storyMaxSeconds: z.coerce.number().int().min(10).max(35).default(35),
  storyMusicMood: z.string().trim().min(1).default("AUTO"),
  storySourceVolume: z.coerce.number().int().min(0).max(50).default(10),
  storyUseEmojis: z.boolean().default(true),
  intervalMin: z.coerce.number().int().min(5).max(180).default(20),
  intervalMax: z.coerce.number().int().min(5).max(240).default(30),
  windowStartHour: z.coerce.number().int().min(0).max(23).default(21),
  windowStartMinute: z.coerce.number().int().min(0).max(59).default(30),
  windowEndHour: z.coerce.number().int().min(0).max(23).default(23),
  windowEndMinute: z.coerce.number().int().min(0).max(59).default(45),
  fitInsideWindow: z.boolean().default(true),
});

function normalizeUpper(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "AUTO";
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function GET() {
  const [accounts, donors, candidates, musicSummary, viralBrain] = await Promise.all([
    withDbRetry(() =>
      prisma.factoryAccount.findMany({
        where: { platform: "YOUTUBE" },
        select: { id: true, name: true, platform: true },
        orderBy: { createdAt: "desc" },
      }),
    ),
    listSuperUploadDonors({ donorKind: STORY_SHORTS_DONOR_KIND }),
    buildTodayCandidates({ limit: 30, donorKind: STORY_SHORTS_DONOR_KIND }),
    withDbRetry(() =>
      prisma.factoryMusicTrack.groupBy({
        by: ["mood"],
        where: {
          isActive: true,
          copyrightStatus: {
            in: ["SAFE_YOUTUBE_AUDIO_LIBRARY", "SAFE_OWNED", "SAFE_ROYALTY_FREE"],
          },
        },
        _count: { _all: true },
      }),
    ),
    getViralBrainContext("ROBLOX"),
  ]);

  return NextResponse.json({
    accounts,
    donors: donors.map((donor) => ({
      ...donor,
      subscriberCount: donor.subscriberCount.toString(),
      videoCount: donor.videoCount.toString(),
      viewCount: donor.viewCount.toString(),
    })),
    candidates,
    musicSummary: musicSummary.map((item) => ({ mood: item.mood, count: item._count._all })),
    viralBrain: {
      formulasCount: viralBrain.formulas.length,
      referencesCount: viralBrain.snapshot?.referencesCount ?? 0,
      topStoryTypes: viralBrain.snapshot?.topStoryTypes ?? [],
      topHookTypes: viralBrain.snapshot?.topHookTypes ?? [],
      topMusicMoods: viralBrain.snapshot?.topMusicMoods ?? [],
      promptContext: viralBrain.snapshot?.promptContext ?? null,
    },
    storyStyles: [
      "AUTO",
      "LOVE_MONEY",
      "GIFT_CHOICE",
      "SYSTEM_MESSAGE",
      "POOR_RICH",
      "GOOD_EVIL",
      "HORROR_WARNING",
      "BULLYING_REVENGE",
      "BULLIED_BACON",
      "SAVE_MOM_OR_MONEY",
      "CHOICE_PUNISHMENT",
      "REVENGE",
      "GIFT_BETRAYAL",
      "HORROR_ESCAPE",
      "FUNNY_FAIL",
      "SAVE_SOMEONE",
      "YEAR_COMPARISON",
    ],
    musicMoods: [
      "AUTO",
      "sad",
      "emotional",
      "suspense",
      "horror",
      "scary",
      "funny",
      "chaos",
      "epic",
      "victory",
      "fail",
      "cute",
      "magical",
      "gift",
      "choice",
      "rich",
      "poor",
      "love",
      "bullying",
      "revenge",
      "system",
      "mystery",
      "surprise",
      "dramatic",
      "chase",
      "chill",
      "explaining",
      "finale",
      "happy",
      "hype",
      "intense",
      "other",
      "random",
      "riser",
      "sneaky",
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const account = await withDbRetry(() =>
      prisma.factoryAccount.findUnique({
        where: { id: body.accountId },
        select: { id: true, name: true, platform: true },
      }),
    );

    if (!account) {
      return NextResponse.json({ error: "YouTube-аккаунт не найден" }, { status: 404 });
    }

    const candidates = (await buildTodayCandidates({
      limit: body.candidatesCount,
      donorKind: STORY_SHORTS_DONOR_KIND,
    })).slice(0, body.candidatesCount);

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Нет кандидатов. Сначала добавь доноров и проверь их." },
        { status: 400 },
      );
    }

    const schedule = await buildSuperUploadSchedule({
      clipsCount: candidates.length,
      intervalMin: body.intervalMin,
      intervalMax: body.intervalMax,
      windowStartHour: body.windowStartHour,
      windowStartMinute: body.windowStartMinute,
      windowEndHour: body.windowEndHour,
      windowEndMinute: body.windowEndMinute,
      fitInsideWindow: body.fitInsideWindow,
    });

    const viralBrain = await getViralBrainContext("ROBLOX");
    const jobs = [];
    const packages = [];

    for (const [index, sourceVideo] of candidates.entries()) {
      const selectedFormula = selectBestFormulaForSource({
        title: sourceVideo.title,
        formulas: viralBrain.formulas,
      });
      const effectiveStoryStyle = normalizeUpper(body.storyStyle === "AUTO" && selectedFormula ? selectedFormula.storyType : body.storyStyle);
      const effectiveMusicMood = body.storyMusicMood === "AUTO" && selectedFormula ? selectedFormula.musicMood : body.storyMusicMood;

      const slot = schedule.slots[index];
      const pack = await withDbRetry(() =>
        prisma.factorySuperUploadPackage.create({
          data: {
            sourceVideoId: sourceVideo.id,
            accountId: account.id,
            accountName: account.name,
            game: "ROBLOX",
            clipsCount: 1,
            clipSeconds: body.storyMaxSeconds,
            hookPreviewSeconds: 0,
            intervalMin: body.intervalMin,
            intervalMax: body.intervalMax,
            scheduleMode: "ROBLOX_STORY_WINDOW",
            hookMode: effectiveStoryStyle,
            titlePrefix: "roblox story shorts",
            status: "CREATED",
            recommendation: `Roblox Story Shorts: AI сам выбирает длину ${body.storyMinSeconds}-${body.storyMaxSeconds} сек, стиль ${effectiveStoryStyle}, музыка ${effectiveMusicMood}. ${slot.label} NY.`,
          },
        }),
      );

      const job = await withDbRetry(() =>
        prisma.factoryJob.create({
          data: {
            sourceUrl: sourceVideo.sourceUrl,
            sourceOriginalName: sourceVideo.title,
            clipSeconds: body.storyMaxSeconds,
            clipStartIndex: 0,
            titlePrefix: "roblox story shorts",
            game: "ROBLOX",
            platforms: [account.platform],
            status: "QUEUED",
            progress: 0,
            progressLabel: `ROBLOX STORY ${index + 1}/${candidates.length}: AI длина ${body.storyMinSeconds}-${body.storyMaxSeconds} сек · ${slot.label} NY`,
            publishTiming: "USA_SMART",
            scheduledAt: slot.scheduledAt,
            cutMode: "ROBLOX_STORY_AI",
            smartStepSeconds: 5,
            smartCandidates: 90,
            smartMinGapSeconds: 24,
            storyStyle: effectiveStoryStyle,
            storyMinSeconds: body.storyMinSeconds,
            storyMaxSeconds: body.storyMaxSeconds,
            storyMusicMood: effectiveMusicMood,
            storySourceVolume: body.storySourceVolume,
            storyUseEmojis: body.storyUseEmojis,
            cancelRequested: false,
            superUploadPackageId: pack.id,
            viralFormulaId: selectedFormula?.id ?? null,
            viralFormulaSnapshot: toPrismaJson(selectedFormula),
            viralBrainSnapshot: toPrismaJson(viralBrain.snapshot),
            targets: {
              create: {
                accountId: account.id,
                platform: account.platform,
                templateId: null,
                titlePrefix: "roblox story shorts",
                maxClips: 1,
              },
            },
          },
        }),
      );

      await withDbRetry(() =>
        prisma.factorySourceVideo.update({
          where: { id: sourceVideo.id },
          data: { isUsed: true, usedAt: new Date() },
        }),
      );

      packages.push(pack);
      jobs.push(job);
    }

    return NextResponse.json({
      packages,
      jobs,
      schedule: schedule.slots,
      candidates,
      message: `Roblox Story Shorts создано: ${jobs.length}. Viral Lab формул подключено: ${viralBrain.formulas.length}. AI сам выберет длину ${body.storyMinSeconds}-${body.storyMaxSeconds} сек и музыку.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось создать Roblox Story Shorts" },
      { status: 500 },
    );
  }
}
