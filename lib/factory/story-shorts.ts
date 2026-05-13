import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { FACTORY_TEMP_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { readCommand, runCommand, safeFileName } from "@/lib/factory/video";
import { buildSmartClipCandidates } from "@/lib/factory/smart-cut";

type ProgressCallback = (progress: number, label: string) => Promise<void>;
type CancelCheck = () => Promise<boolean>;

export type RobloxStoryCandidate = {
  startSec: number;
  endSec: number;
  durationSec: number;
  hookMomentSec: number;
  motionScore: number;
  audioScore: number;
  sceneScore: number;
  finalScore: number;
  aiScore: number;
  selected: boolean;
  overlayText: string;
  secondaryText: string;
  title: string;
  description: string;
  storyStyle: string;
  musicMood: string;
  reason: string;
};

type BuildRobloxStoryInput = {
  sourcePath: string;
  duration: number;
  maxClips: number;
  minSeconds: number;
  maxSeconds: number;
  storyStyle?: string | null;
  sourceTitle?: string | null;
  useEmojis?: boolean;
  stepSeconds: number;
  maxCandidates: number;
  minGapSeconds: number;
  onProgress?: ProgressCallback;
  isCanceled?: CancelCheck;
};

type AiStoryReview = {
  score: number;
  storyStyle: string;
  musicMood: string;
  durationSec: number;
  overlayText: string;
  secondaryText: string;
  title: string;
  reason: string;
};

const OPENAI_MODEL = process.env.OPENAI_STORY_MODEL ?? process.env.OPENAI_HOOK_MODEL ?? "gpt-4.1-mini";
const FRAME_WIDTH = Number(process.env.FACTORY_STORY_FRAME_WIDTH ?? 360);
const MAX_AI_REVIEWS = Number(process.env.FACTORY_STORY_AI_REVIEWS ?? 32);

const STORY_STYLES = [
  "auto",
  "love_money",
  "gift_choice",
  "system_message",
  "poor_rich",
  "good_evil",
  "horror_warning",
  "bullying_revenge",
  "funny_fail",
  "save_someone",
  "year_comparison",
];

const MUSIC_MOODS = [
  "sad",
  "emotional",
  "suspense",
  "horror",
  "funny",
  "chaos",
  "epic",
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
];

const FALLBACK_OVERLAYS = [
  "LOVE OR\nMONEY?! 😳💔",
  "WHO WOULD\nYOU SAVE?! 😭",
  "SYSTEM:\nSTAY POOR FOREVER 💔",
  "HE PICKED\nTHE WRONG GIFT 🎁😱",
  "DON'T LOOK\nBEHIND HIM 😨",
  "BACON DID\nNOTHING WRONG 😭",
  "THE ENDING\nMADE ME CRY 😭",
  "SHE THOUGHT\nHE WAS EVIL 😳",
  "ROBLOX GAVE HIM\nONE CHOICE 😱",
  "THEY BULLIED HIM\nSO HE... 💔",
];

const FALLBACK_TITLES = [
  "He picked MONEY instead of love.. 😭💔",
  "The ending made me cry.. 😭",
  "Who would you save?! 😳💔",
  "They BULLIED him, so he...",
  "She thought he was evil.. 😳",
  "He picked the wrong gift.. 🎁😱",
  "The system made him poor forever.. 💔",
  "Bacon did nothing wrong... 😢",
  "Roblox gave him one choice.. 😱",
  "The poor noob got revenge.. 😭",
  "This gift changed everything.. 🎁",
  "He should not have opened it.. 😨",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pick<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function normalizeStoryStyle(value?: string | null) {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  return STORY_STYLES.includes(normalized) ? normalized : "auto";
}

function normalizeMusicMood(value?: string | null) {
  const normalized = String(value ?? "suspense").trim().toLowerCase();
  if (MUSIC_MOODS.includes(normalized)) return normalized;
  return "suspense";
}

function normalizeOverlay(value: string, useEmojis = true) {
  let text = value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n")
    .trim();

  if (!useEmojis) {
    text = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
  }

  if (!text) return useEmojis ? "WATCH THIS 😳" : "WATCH THIS";
  return text.slice(0, 90);
}

function normalizeTitle(value: string, seed: number, usedTitles: Set<string>) {
  let title = value.replace(/\s+/g, " ").trim();
  const tooDry = /^roblox\s+(choice|system|story|horror|moment|game):/i.test(title);
  const generic = !title || tooDry || /wait for (the )?ending/i.test(title);

  if (generic) title = pick(FALLBACK_TITLES, seed);

  title = title.slice(0, 90);
  let candidate = title;
  let attempt = 0;

  while (usedTitles.has(candidate.toLowerCase())) {
    attempt += 1;
    candidate = pick(FALLBACK_TITLES, seed + attempt).slice(0, 90);
    if (attempt > FALLBACK_TITLES.length + 3) {
      candidate = `${title.replace(/[.\s]+$/g, "")} #${attempt}`.slice(0, 90);
      break;
    }
  }

  usedTitles.add(candidate.toLowerCase());
  return candidate;
}

async function assertNotCanceled(isCanceled?: CancelCheck) {
  if (await isCanceled?.()) throw new Error("Задача отменена пользователем");
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
    { isCanceled: input.isCanceled },
  );
}

async function imageToDataUrl(filePath: string) {
  const buffer = await readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text.trim()) as Partial<AiStoryReview>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Partial<AiStoryReview>;
    } catch {
      return null;
    }
  }
}

async function reviewStoryCandidateWithOpenAi(input: {
  frames: string[];
  sourceTitle?: string | null;
  storyStyle: string;
  minSeconds: number;
  maxSeconds: number;
  useEmojis: boolean;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const content = [
    {
      type: "text",
      text: [
        "You are creating viral Roblox Story Shorts for a young audience.",
        "This is NOT normal gameplay and NOT a facecam reaction. The final video is full-screen vertical Roblox gameplay with huge text, emojis, and music.",
        "Choose moments that can become an instantly understandable mini story in 0.3 seconds: love or money, gift, choice, system message, poor vs rich, good vs evil, horror warning, bullying/revenge, rescue, funny fail, surprise ending.",
        "Reject boring running, random movement, or unclear gameplay unless it can become a simple story.",
        `Requested story style: ${input.storyStyle}`,
        `Source title: ${input.sourceTitle ?? "unknown"}`,
        `Duration must be between ${input.minSeconds} and ${input.maxSeconds} seconds. Prefer 20-35 seconds. Never over ${input.maxSeconds}.`,
        "Overlay text rules: 2-3 short lines, huge, simple, emotional, child-readable. Emojis are allowed if requested.",
        "Title rules: viral Roblox Shorts style, emotional, simple, with emojis and suspense. Do NOT write dry SEO titles like 'Roblox choice: He picked the wrong life'. Good: 'He picked MONEY instead of love.. 😭💔', 'Who would you save?! 😳💔', 'They BULLIED him, so he...'.",
        "Music mood must be one of: sad, emotional, suspense, horror, funny, chaos, epic, cute, magical, gift, choice, rich, poor, love, bullying, revenge, system, mystery, surprise, dramatic.",
        "Return strict JSON only.",
        "Schema: {\"score\":0-100,\"storyStyle\":\"short_snake_case\",\"musicMood\":\"suspense\",\"durationSec\":25,\"overlayText\":\"LINE 1\\nLINE 2 😳\",\"secondaryText\":\"optional second text\",\"title\":\"viral title\",\"reason\":\"one short sentence\"}",
      ].join("\n"),
    },
    ...input.frames.map((frame) => ({
      type: "image_url",
      image_url: { url: frame, detail: "low" },
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
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI story review failed: ${response.status} ${body.slice(0, 800)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const parsed = safeJsonParse(data.choices?.[0]?.message?.content ?? "");
  if (!parsed) return null;

  return {
    score: clamp(Math.round(Number(parsed.score ?? 50)), 0, 100),
    storyStyle: normalizeStoryStyle(String(parsed.storyStyle ?? input.storyStyle)),
    musicMood: normalizeMusicMood(String(parsed.musicMood ?? "suspense")),
    durationSec: clamp(Math.round(Number(parsed.durationSec ?? 25)), input.minSeconds, input.maxSeconds),
    overlayText: normalizeOverlay(String(parsed.overlayText ?? ""), input.useEmojis),
    secondaryText: normalizeOverlay(String(parsed.secondaryText ?? ""), input.useEmojis),
    title: String(parsed.title ?? ""),
    reason: String(parsed.reason ?? "AI selected this as a clear Roblox story moment.").slice(0, 240),
  } satisfies AiStoryReview;
}

function buildFallbackReview(input: {
  seed: number;
  technicalScore: number;
  minSeconds: number;
  maxSeconds: number;
  storyStyle: string;
  useEmojis: boolean;
}) {
  return {
    score: clamp(input.technicalScore, 38, 82),
    storyStyle: normalizeStoryStyle(input.storyStyle),
    musicMood: pick(["suspense", "dramatic", "surprise", "funny", "sad"], input.seed),
    durationSec: clamp(22 + (Math.abs(input.seed) % 12), input.minSeconds, input.maxSeconds),
    overlayText: normalizeOverlay(pick(FALLBACK_OVERLAYS, input.seed), input.useEmojis),
    secondaryText: "",
    title: pick(FALLBACK_TITLES, input.seed),
    reason: "Fallback: selected by motion/scene/audio and packaged as a Roblox story.",
  } satisfies AiStoryReview;
}

function buildTiming(input: {
  technicalStartSec: number;
  roughHookSec: number;
  duration: number;
  selectedDuration: number;
}) {
  const clipSeconds = clamp(input.selectedDuration, 10, 35);
  const safeHook = clamp(input.roughHookSec, 2, Math.max(2, input.duration - 1));
  const startSec = clamp(
    Math.round(safeHook - Math.min(clipSeconds - 2, Math.max(6, Math.floor(clipSeconds * 0.65)))),
    0,
    Math.max(0, Math.floor(input.duration - clipSeconds)),
  );
  const endSec = Math.min(Math.floor(input.duration), startSec + clipSeconds);

  return {
    startSec,
    endSec,
    durationSec: Math.max(10, endSec - startSec),
    hookMomentSec: clamp(Math.round(safeHook), startSec + 1, Math.max(startSec + 1, endSec - 1)),
  };
}

function hasOverlap(candidate: RobloxStoryCandidate, selected: RobloxStoryCandidate[], minGapSeconds: number) {
  return selected.some((item) => Math.abs(item.hookMomentSec - candidate.hookMomentSec) < minGapSeconds);
}

export async function buildRobloxStoryShortCandidates(input: BuildRobloxStoryInput) {
  await ensureFactoryDirs();
  await assertNotCanceled(input.isCanceled);

  const minSeconds = clamp(input.minSeconds, 10, 30);
  const maxSeconds = clamp(Math.max(input.maxSeconds, minSeconds), minSeconds, 35);
  const storyStyle = normalizeStoryStyle(input.storyStyle);

  const technicalCandidates = await buildSmartClipCandidates({
    sourcePath: input.sourcePath,
    duration: input.duration,
    clipSeconds: maxSeconds,
    maxClips: Math.min(Math.max(input.maxClips * 4, 24), 80),
    stepSeconds: input.stepSeconds,
    maxCandidates: input.maxCandidates,
    minGapSeconds: Math.max(8, Math.floor(input.minGapSeconds / 2)),
    clipStartIndex: 0,
    isCanceled: input.isCanceled,
    onProgress: input.onProgress,
  });

  const reviewPool = [...technicalCandidates]
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, Math.max(4, Math.min(MAX_AI_REVIEWS, input.maxCandidates)));

  const tempDir = path.join(
    FACTORY_TEMP_DIR,
    `story-${safeFileName(path.basename(input.sourcePath))}-${nanoid(8)}`,
  );
  await mkdir(tempDir, { recursive: true });

  const usedTitles = new Set<string>();

  try {
    const candidates: RobloxStoryCandidate[] = [];

    for (let index = 0; index < reviewPool.length; index += 1) {
      await assertNotCanceled(input.isCanceled);
      const technical = reviewPool[index];
      const roughHookSec = clamp(
        technical.startSec + Math.min(20, Math.max(3, Math.round(maxSeconds * 0.7))),
        1,
        Math.max(1, input.duration - 1),
      );

      await input.onProgress?.(
        35 + Math.min(25, Math.round(((index + 1) / reviewPool.length) * 25)),
        `Roblox Story AI: анализирую сюжетный момент ${index + 1}/${reviewPool.length}`,
      );

      const frameTimes = [-4, -2, 0, 2, 4].map((offset) =>
        clamp(roughHookSec + offset, 0, Math.max(0, input.duration - 1)),
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
      let review: AiStoryReview | null = null;

      try {
        review = await reviewStoryCandidateWithOpenAi({
          frames: frameDataUrls,
          sourceTitle: input.sourceTitle,
          storyStyle,
          minSeconds,
          maxSeconds,
          useEmojis: input.useEmojis ?? true,
        });
      } catch (error) {
        console.error("OpenAI Roblox Story review failed, using fallback", error);
      }

      const finalReview = review ?? buildFallbackReview({
        seed: technical.finalScore + index,
        technicalScore: technical.finalScore,
        minSeconds,
        maxSeconds,
        storyStyle,
        useEmojis: input.useEmojis ?? true,
      });

      const timing = buildTiming({
        technicalStartSec: technical.startSec,
        roughHookSec,
        duration: input.duration,
        selectedDuration: finalReview.durationSec,
      });
      const finalScore = clamp(Math.round(technical.finalScore * 0.34 + finalReview.score * 0.66), 0, 100);

      candidates.push({
        ...timing,
        motionScore: technical.motionScore,
        audioScore: technical.audioScore,
        sceneScore: technical.sceneScore,
        finalScore,
        aiScore: finalReview.score,
        selected: false,
        overlayText: finalReview.overlayText,
        secondaryText: finalReview.secondaryText,
        title: normalizeTitle(finalReview.title, index + finalScore, usedTitles),
        description: finalReview.reason,
        storyStyle: finalReview.storyStyle,
        musicMood: finalReview.musicMood,
        reason: [
          `Story AI ${finalReview.score}/100`,
          finalReview.reason,
          `style ${finalReview.storyStyle}`,
          `music ${finalReview.musicMood}`,
          `duration ${timing.durationSec}s`,
          technical.reason,
        ].join(" · "),
      });
    }

    const sorted = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
    const selected: RobloxStoryCandidate[] = [];

    for (const candidate of sorted) {
      if (selected.length >= input.maxClips) break;
      if (hasOverlap(candidate, selected, Math.max(input.minGapSeconds, candidate.durationSec))) continue;
      selected.push({ ...candidate, selected: true });
    }

    const selectedKeys = new Set(selected.map((item) => `${item.startSec}:${item.hookMomentSec}`));

    return candidates
      .map((candidate) => ({
        ...candidate,
        selected: selectedKeys.has(`${candidate.startSec}:${candidate.hookMomentSec}`),
      }))
      .sort((a, b) => a.startSec - b.startSec);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function detectAudioPeakStart(input: {
  filePath: string;
  clipSeconds: number;
  targetPeakSecond: number;
}) {
  try {
    const output = await readCommand("ffmpeg", [
      "-hide_banner",
      "-i",
      input.filePath,
      "-af",
      "astats=metadata=1:reset=1",
      "-f",
      "null",
      "-",
    ]);

    // ffmpeg writes astats to stderr in most builds, so this is mostly a safe placeholder.
    void output;
  } catch {
    // ignore: we still return a deterministic offset below.
  }

  return Math.max(0, Math.round(input.targetPeakSecond - Math.min(8, input.clipSeconds * 0.45)));
}
