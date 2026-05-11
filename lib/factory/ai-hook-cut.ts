import { mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { FactoryGame } from "@prisma/client";

import { FACTORY_TEMP_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { readCommand, runCommand, safeFileName } from "@/lib/factory/video";
import { buildSmartClipCandidates } from "@/lib/factory/smart-cut";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

export type AiHookCutCandidate = {
  startSec: number;
  endSec: number;
  durationSec: number;
  hookMomentSec: number;
  hookPreviewStartSec: number;
  hookPreviewDurationSec: number;
  motionScore: number;
  audioScore: number;
  firstFrameScore: number;
  sceneScore: number;
  finalScore: number;
  aiScore: number;
  selected: boolean;
  overlayText: string;
  title: string;
  description: string;
  momentType: string;
  reason: string;
};

type BuildAiHookCutInput = {
  sourcePath: string;
  duration: number;
  clipSeconds: number;
  maxClips: number;
  stepSeconds: number;
  maxCandidates: number;
  minGapSeconds: number;
  clipStartIndex?: number;
  sourceTitle?: string | null;
  game: FactoryGame;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
};

type AiCandidateReview = {
  hookScore: number;
  momentType: string;
  overlayText: string;
  title: string;
  reason: string;
};

const HOOK_PREVIEW_SECONDS = Number(
  process.env.FACTORY_AI_HOOK_PREVIEW_SECONDS ?? 3,
);

const OPENAI_MODEL = process.env.OPENAI_HOOK_MODEL ?? "gpt-4.1-mini";
const MAX_AI_REVIEWS = Number(process.env.FACTORY_AI_HOOK_REVIEWS ?? 24);
const FRAME_WIDTH = Number(process.env.FACTORY_AI_HOOK_FRAME_WIDTH ?? 360);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeOverlayText(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9?!'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!cleaned) return "WAIT FOR IT";

  return cleaned.split(" ").slice(0, 6).join(" ").slice(0, 42);
}

function normalizeTitle(value: string, sourceTitle?: string | null) {
  const cleaned = value.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return buildFallbackTitle(sourceTitle);
  }

  const withRoblox = /roblox/i.test(cleaned) ? cleaned : `Roblox: ${cleaned}`;

  return withRoblox.slice(0, 95);
}

function buildFallbackTitle(sourceTitle?: string | null) {
  const source = (sourceTitle ?? "").toLowerCase();

  if (source.includes("obby")) return "Roblox obby: No way he makes this";
  if (source.includes("parkour")) return "Roblox parkour: This got too close";
  if (source.includes("tower")) return "Roblox tower: The final jump was insane";
  if (source.includes("escape")) return "Roblox escape: He should not survive this";
  if (source.includes("survive") || source.includes("survival")) {
    return "Roblox survival: This was too close";
  }
  if (source.includes("funny") || source.includes("fail")) {
    return "Roblox fail: The ending hurts";
  }
  if (source.includes("doors") || source.includes("horror")) {
    return "Roblox horror: Wait for the ending";
  }

  return "Roblox: Wait for the ending";
}

function buildFallbackOverlay(sourceTitle?: string | null) {
  const source = (sourceTitle ?? "").toLowerCase();

  if (source.includes("obby") || source.includes("parkour") || source.includes("tower")) {
    return "NO WAY HE MAKES THIS";
  }

  if (source.includes("escape") || source.includes("survive") || source.includes("survival")) {
    return "HE SHOULD NOT SURVIVE";
  }

  if (source.includes("funny") || source.includes("fail")) {
    return "THE FAIL HURTS";
  }

  if (source.includes("doors") || source.includes("horror")) {
    return "WAIT FOR THE ENDING";
  }

  return "WAIT FOR IT";
}

function safeJsonParse(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as Partial<AiCandidateReview>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) return null;

    try {
      return JSON.parse(match[0]) as Partial<AiCandidateReview>;
    } catch {
      return null;
    }
  }
}

async function assertNotCanceled(isCanceled?: CancelCheck) {
  if (await isCanceled?.()) {
    throw new Error("Задача отменена пользователем");
  }
}

async function extractFrame(input: {
  sourcePath: string;
  timeSec: number;
  outputPath: string;
  isCanceled?: CancelCheck;
}) {
  await runCommand(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(Math.max(0, input.timeSec)),
      "-i",
      input.sourcePath,
      "-frames:v",
      "1",
      "-update",
      "1",
      "-vf",
      `scale=${FRAME_WIDTH}:-2:force_original_aspect_ratio=decrease`,
      "-q:v",
      "4",
      input.outputPath,
    ],
    {
      isCanceled: input.isCanceled,
    },
  );
}

async function imageToDataUrl(filePath: string) {
  const buffer = await readFile(filePath);

  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function reviewCandidateWithOpenAi(input: {
  frames: string[];
  sourceTitle?: string | null;
  game: FactoryGame;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const content = [
    {
      type: "text",
      text: [
        "You are selecting viral hook moments for Roblox YouTube Shorts.",
        "The final Short will start with a 3 second full-screen Roblox preview, then switch to gameplay + a girl watching.",
        "Judge only whether these frames are a strong first-2-second hook.",
        "Prefer danger, jumps, falls, lava, obstacles, escape, near fails, scary monsters, intense timing, funny fails, clear visual tension.",
        "Return strict JSON only.",
        `Source video title: ${input.sourceTitle ?? "unknown"}`,
        "Schema:",
        "{\"hookScore\":0-100,\"momentType\":\"short_snake_case\",\"overlayText\":\"MAX 6 WORDS UPPERCASE\",\"title\":\"Roblox ...\",\"reason\":\"one short sentence\"}",
      ].join("\n"),
    },
    ...input.frames.map((frame) => ({
      type: "image_url",
      image_url: {
        url: frame,
        detail: "low",
      },
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI hook review failed: ${response.status} ${body.slice(0, 800)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const contentText = data.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonParse(contentText);

  if (!parsed) {
    return null;
  }

  return {
    hookScore: clamp(Math.round(Number(parsed.hookScore ?? 50)), 0, 100),
    momentType: String(parsed.momentType ?? "roblox_hook").slice(0, 80),
    overlayText: normalizeOverlayText(String(parsed.overlayText ?? "")),
    title: normalizeTitle(String(parsed.title ?? ""), input.sourceTitle),
    reason: String(parsed.reason ?? "AI selected this as a stronger visual hook.").slice(0, 240),
  } satisfies AiCandidateReview;
}

function buildFallbackReview(input: {
  sourceTitle?: string | null;
  technicalScore: number;
}) {
  return {
    hookScore: clamp(input.technicalScore, 35, 88),
    momentType: "technical_motion_peak",
    overlayText: buildFallbackOverlay(input.sourceTitle),
    title: buildFallbackTitle(input.sourceTitle),
    reason: "Fallback: selected by motion, scene change and audio peak.",
  } satisfies AiCandidateReview;
}

function buildTiming(input: {
  hookMomentSec: number;
  duration: number;
  clipSeconds: number;
}) {
  const previewDuration = clamp(HOOK_PREVIEW_SECONDS, 2, 5);
  const mainDuration = Math.max(5, input.clipSeconds - previewDuration);
  const safeHookMoment = clamp(
    input.hookMomentSec,
    Math.min(input.duration, mainDuration),
    Math.max(mainDuration, input.duration - 1),
  );
  const startSec = clamp(
    Math.round(safeHookMoment - mainDuration),
    0,
    Math.max(0, Math.floor(input.duration - input.clipSeconds)),
  );
  const endSec = Math.min(Math.floor(input.duration), Math.round(startSec + mainDuration));
  const hookMomentSec = Math.min(Math.floor(input.duration - 1), endSec);
  const hookPreviewStartSec = clamp(
    Math.round(hookMomentSec - previewDuration + 1),
    0,
    Math.max(0, Math.floor(input.duration - previewDuration)),
  );

  return {
    startSec,
    endSec,
    durationSec: Math.max(1, endSec - startSec),
    hookMomentSec,
    hookPreviewStartSec,
    hookPreviewDurationSec: previewDuration,
  };
}

function hasOverlap(
  candidate: AiHookCutCandidate,
  selected: AiHookCutCandidate[],
  minGapSeconds: number,
) {
  return selected.some(
    (item) => Math.abs(item.hookMomentSec - candidate.hookMomentSec) < minGapSeconds,
  );
}

function selectBest(input: {
  candidates: AiHookCutCandidate[];
  maxClips: number;
  minGapSeconds: number;
}) {
  const sorted = [...input.candidates].sort((a, b) => b.finalScore - a.finalScore);
  const selected: AiHookCutCandidate[] = [];

  for (const candidate of sorted) {
    if (selected.length >= input.maxClips) break;
    if (hasOverlap(candidate, selected, input.minGapSeconds)) continue;

    selected.push({ ...candidate, selected: true });
  }

  const selectedKeys = new Set(selected.map((item) => `${item.startSec}:${item.hookMomentSec}`));

  return input.candidates
    .map((candidate) => ({
      ...candidate,
      selected: selectedKeys.has(`${candidate.startSec}:${candidate.hookMomentSec}`),
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

export async function buildAiHookCutCandidates(input: BuildAiHookCutInput) {
  await ensureFactoryDirs();
  await assertNotCanceled(input.isCanceled);

  const technicalCandidates = await buildSmartClipCandidates({
    sourcePath: input.sourcePath,
    duration: input.duration,
    clipSeconds: Math.max(10, Math.min(20, input.clipSeconds)),
    maxClips: Math.min(Math.max(input.maxClips * 3, 18), 60),
    stepSeconds: input.stepSeconds,
    maxCandidates: input.maxCandidates,
    minGapSeconds: Math.max(10, Math.floor(input.minGapSeconds / 2)),
    clipStartIndex: input.clipStartIndex,
    isCanceled: input.isCanceled,
    onProgress: input.onProgress,
  });

  const reviewPool = [...technicalCandidates]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, Math.max(4, Math.min(MAX_AI_REVIEWS, input.maxCandidates)));

  const tempDir = path.join(
    FACTORY_TEMP_DIR,
    `ai-hook-${safeFileName(path.basename(input.sourcePath))}-${nanoid(8)}`,
  );

  await mkdir(tempDir, { recursive: true });

  try {
    const candidates: AiHookCutCandidate[] = [];

    for (let index = 0; index < reviewPool.length; index += 1) {
      await assertNotCanceled(input.isCanceled);

      const technical = reviewPool[index];
      const roughHookMomentSec = clamp(
        technical.startSec + Math.min(8, Math.max(2, Math.floor(input.clipSeconds / 8))),
        1,
        Math.max(1, input.duration - 1),
      );

      await input.onProgress?.(
        35 + Math.min(22, Math.round(((index + 1) / reviewPool.length) * 22)),
        `AI Hook Cut: OpenAI анализирует момент ${index + 1}/${reviewPool.length}`,
      );

      const frameTimes = [-2, 0, 2].map((offset) =>
        clamp(roughHookMomentSec + offset, 0, Math.max(0, input.duration - 1)),
      );
      const framePaths: string[] = [];

      for (let frameIndex = 0; frameIndex < frameTimes.length; frameIndex += 1) {
        const framePath = path.join(tempDir, `${index}-${frameIndex}.jpg`);
        await extractFrame({
          sourcePath: input.sourcePath,
          timeSec: frameTimes[frameIndex],
          outputPath: framePath,
          isCanceled: input.isCanceled,
        });
        framePaths.push(framePath);
      }

      const frameDataUrls = await Promise.all(framePaths.map(imageToDataUrl));
      let review: AiCandidateReview | null = null;

      try {
        review = await reviewCandidateWithOpenAi({
          frames: frameDataUrls,
          sourceTitle: input.sourceTitle,
          game: input.game,
        });
      } catch (error) {
        console.error("OpenAI hook review failed, using fallback", error);
      }

      const finalReview = review ??
        buildFallbackReview({
          sourceTitle: input.sourceTitle,
          technicalScore: technical.finalScore,
        });
      const timing = buildTiming({
        hookMomentSec: roughHookMomentSec,
        duration: input.duration,
        clipSeconds: input.clipSeconds,
      });
      const finalScore = clamp(
        Math.round(technical.finalScore * 0.42 + finalReview.hookScore * 0.58),
        0,
        100,
      );

      candidates.push({
        ...timing,
        motionScore: technical.motionScore,
        audioScore: technical.audioScore,
        firstFrameScore: technical.firstFrameScore,
        sceneScore: technical.sceneScore,
        finalScore,
        aiScore: finalReview.hookScore,
        selected: false,
        overlayText: finalReview.overlayText,
        title: finalReview.title,
        description: finalReview.reason,
        momentType: finalReview.momentType,
        reason: [
          `AI ${finalReview.hookScore}/100`,
          finalReview.reason,
          technical.reason,
          `hook ${timing.hookMomentSec}s`,
          `preview ${timing.hookPreviewStartSec}s`,
        ].join(" · "),
      });
    }

    if (candidates.length === 0) return [];

    return selectBest({
      candidates,
      maxClips: input.maxClips,
      minGapSeconds: Math.max(input.clipSeconds, input.minGapSeconds),
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
