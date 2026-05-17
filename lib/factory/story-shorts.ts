import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { FACTORY_TEMP_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { readCommand, runCommand, safeFileName } from "@/lib/factory/video";
import { buildSmartClipCandidates } from "@/lib/factory/smart-cut";
import {
  getUsedTextList,
  makeUniqueRobloxOverlay,
  makeUniqueRobloxStoryTitle,
} from "@/lib/factory/roblox-story-uniqueness";

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
  conflictText: string;
  escalationText: string;
  punchlineText: string;
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
  viralBrainPromptContext?: string | null;
  viralFormula?: unknown;
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
  conflictText: string;
  escalationText: string;
  punchlineText: string;
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
  "bullied_bacon",
  "save_mom_or_money",
  "choice_punishment",
  "revenge",
  "gift_betrayal",
  "horror_escape",
  "funny_fail",
  "save_someone",
  "year_comparison",
];

const MUSIC_MOODS = [
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
  "BACON HAD\n10 SECONDS 😳",
  "THEY BULLIED HIM\nSO HE... 💔",
];

const FALLBACK_TITLES = [
  "He picked MONEY instead of love.. 😭💔",
  "This Roblox ending was unfair 😭",
  "Who would you save?! 😳💔",
  "They BULLIED him, so he...",
  "She thought he was evil.. 😳",
  "He picked the wrong gift.. 🎁😱",
  "The system made him poor forever.. 💔",
  "Bacon did nothing wrong... 😢",
  "The poor noob got revenge.. 😭",
  "This gift changed everything.. 🎁",
  "Roblox warned him too late 😨",
];

const FALLBACK_CONFLICTS = [
  "HE HAD\nONE CHOICE 😳",
  "EVERYONE\nLAUGHED AT HIM 💔",
  "SHE OPENED\nTHE DOOR... 😨",
  "THE SYSTEM\nSAID NO 😭",
  "HE PICKED\nTHE LEFT SIDE 👀",
  "THE GIFT\nLOOKED NORMAL 🎁",
  "SHE TRUSTED\nTHE WRONG GUY 😳",
  "NOBODY\nHELPED HIM 😢",
];

const FALLBACK_ESCALATIONS = [
  "THEN IT GOT\nEVEN WORSE 😭",
  "WAIT...\nWHAT?! 😱",
  "HE WAS\nTOO LATE 💀",
  "THEY MADE\nA BIG MISTAKE 😳",
  "EVERYTHING\nCHANGED... 💔",
  "THE TRAP\nWAS REAL 😨",
  "SHE SHOULD\nRUN NOW 😱",
  "HE LOST\nEVERYTHING 😭",
];

const FALLBACK_PUNCHLINES = [
  "THE ENDING\nIS SO SAD 😭",
  "BIGGEST\nMISTAKE... 💔",
  "HE GOT\nREVENGE 😳",
  "I DID NOT\nEXPECT THAT 😱",
  "SHE WAS\nNOT EVIL 😭",
  "THE GIFT\nWAS CURSED 🎁",
  "WHO WOULD\nYOU SAVE?! 😳",
  "COMMENT\nYOUR CHOICE 👇",
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

function normalizeOptionalOverlay(value: unknown, useEmojis = true) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return normalizeOverlay(raw, useEmojis);
}

function normalizeTitle(input: {
  value: string;
  seed: number;
  usedTitles: Set<string>;
  sourceTitle?: string | null;
  storyStyle?: string | null;
  musicMood?: string | null;
  clipIndex?: number;
}) {
  return makeUniqueRobloxStoryTitle({
    title: input.value,
    sourceTitle: input.sourceTitle,
    storyStyle: input.storyStyle,
    musicMood: input.musicMood,
    clipIndex: input.clipIndex,
    seed: input.seed,
    usedTitles: input.usedTitles,
  });
}

function normalizeStoryOverlay(input: {
  value: string;
  seed: number;
  usedOverlays: Set<string>;
  sourceTitle?: string | null;
  storyStyle?: string | null;
  musicMood?: string | null;
  clipIndex?: number;
  useEmojis: boolean;
  fallbackRole: "hook" | "conflict" | "escalation" | "punchline";
}) {
  return makeUniqueRobloxOverlay({
    text: input.value,
    sourceTitle: input.sourceTitle,
    storyStyle: input.storyStyle,
    musicMood: input.musicMood,
    clipIndex: input.clipIndex,
    seed: input.seed,
    usedOverlays: input.usedOverlays,
    useEmojis: input.useEmojis,
    fallbackRole: input.fallbackRole,
  });
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
  viralBrainPromptContext?: string | null;
  viralFormula?: unknown;
  usedTitles?: string[];
  usedOverlays?: string[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const content = [
    {
      type: "text",
      text: [
        "You are creating viral Roblox Story Shorts for a young audience.",
        "This is NOT normal gameplay and NOT a facecam reaction. The final video is full-screen vertical Roblox gameplay with huge text, emojis, and music.",
        "You must think like short viral Roblox mini-stories: HOOK -> CONFLICT -> ESCALATION -> PUNCHLINE.",
        "Choose only moments that can become an instantly understandable mini story in 0.3 seconds: love or money, gift, choice, system message, poor vs rich, good vs evil, horror warning, bullying/revenge, rescue, funny fail, surprise ending.",
        "Reject boring running, random movement, or unclear gameplay unless it can become a simple story with a clear conflict and payoff.",
        `Requested story style: ${input.storyStyle}`,
        `Source title: ${input.sourceTitle ?? "unknown"}`,
        input.usedTitles?.length ? `Already used titles in this batch, DO NOT reuse or lightly rewrite them:
${input.usedTitles.map((item) => `- ${item}`).join("\n")}` : "Already used titles in this batch: none.",
        input.usedOverlays?.length ? `Already used overlay hooks in this batch, DO NOT reuse or lightly rewrite them:
${input.usedOverlays.map((item) => `- ${item}`).join("\n")}` : "Already used overlay hooks in this batch: none.",
        input.viralBrainPromptContext ? `Viral Lab brain context:
${input.viralBrainPromptContext}` : "Viral Lab brain context: no learned formulas yet; use safe fallback Roblox story patterns.",
        input.viralFormula ? `Selected reusable viral formula for this donor moment:
${JSON.stringify(input.viralFormula).slice(0, 3500)}` : "Selected reusable viral formula: none.",
        "Use the Viral Lab formula as direction for structure, title pattern, emotional logic, emojis, pacing, and music mood. Do NOT copy any specific reference video. Create original text for this donor gameplay.",
        `Duration must be between ${input.minSeconds} and ${input.maxSeconds} seconds. Respect the creator's selected range; do not hard-code a fixed length. Never over ${input.maxSeconds}.`,
        "Overlay timeline rules: create 3-4 big text beats for the video, not one generic caption. Each beat is 1-3 short lines, huge, simple, emotional, child-readable. Emojis are allowed if requested. Never repeat the same hook overlay in this batch. Never use BACON WAS ALL ALONE as default text.",
        "Beat 1 HOOK: visible at the start, instantly understandable. Beat 2 CONFLICT: what is the problem/choice. Beat 3 ESCALATION: it gets worse/weirder. Beat 4 PUNCHLINE: ending/payoff/question.",
        "Title rules: viral Roblox Shorts style, emotional, simple, with emojis and suspense. Title MUST contain Roblox and MUST be unique in the batch. Hard ban: never start with or include 'Roblox moment:', 'Roblox moments:', 'He should not have survived', 'He almost lost everything', 'The final move saved the run', 'This clip turned insane', 'Wait for the ending', 'Wait for it', or generic SEO titles. Good: 'Roblox Bacon had 1 HP left 😭', 'This Roblox door was a trap 😳', 'They bullied Bacon in Roblox and regretted it 😭'.",
        "Music mood must be one of: sad, emotional, suspense, horror, scary, funny, chaos, epic, victory, fail, cute, magical, gift, choice, rich, poor, love, bullying, revenge, system, mystery, surprise, dramatic, chase, chill, explaining, finale, happy, hype, intense, other, random, riser, sneaky.",
        "Return strict JSON only.",
        "Schema: {\"score\":0-100,\"storyStyle\":\"short_snake_case\",\"musicMood\":\"suspense\",\"durationSec\":25,\"overlayText\":\"HOOK LINE 1\\nHOOK LINE 2 😳\",\"conflictText\":\"CONFLICT TEXT\",\"escalationText\":\"ESCALATION TEXT\",\"punchlineText\":\"PUNCHLINE TEXT\",\"secondaryText\":\"optional small text\",\"title\":\"viral title\",\"reason\":\"one short sentence explaining hook-conflict-escalation-punchline\"}",
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
      temperature: 0.82,
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
    conflictText: normalizeOptionalOverlay(parsed.conflictText ?? parsed.secondaryText, input.useEmojis),
    escalationText: normalizeOptionalOverlay(parsed.escalationText, input.useEmojis),
    punchlineText: normalizeOptionalOverlay(parsed.punchlineText, input.useEmojis),
    secondaryText: normalizeOptionalOverlay(parsed.secondaryText, input.useEmojis),
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
    musicMood: pick(["suspense", "dramatic", "chase", "funny", "sad", "hype", "scary", "finale"], input.seed),
    durationSec: clamp(22 + (Math.abs(input.seed) % 12), input.minSeconds, input.maxSeconds),
    overlayText: normalizeOverlay(pick(FALLBACK_OVERLAYS, input.seed), input.useEmojis),
    conflictText: normalizeOverlay(pick(FALLBACK_CONFLICTS, input.seed + 3), input.useEmojis),
    escalationText: normalizeOverlay(pick(FALLBACK_ESCALATIONS, input.seed + 7), input.useEmojis),
    punchlineText: normalizeOverlay(pick(FALLBACK_PUNCHLINES, input.seed + 11), input.useEmojis),
    secondaryText: "",
    title: pick(FALLBACK_TITLES, input.seed),
    reason: "Fallback: selected by motion/scene/audio and packaged as hook-conflict-escalation-punchline Roblox story.",
  } satisfies AiStoryReview;
}

function buildTiming(input: {
  technicalStartSec: number;
  roughHookSec: number;
  duration: number;
  selectedDuration: number;
}) {
  const clipSeconds = clamp(input.selectedDuration, 10, 60);
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

  const minSeconds = clamp(input.minSeconds, 10, 55);
  const maxSeconds = clamp(Math.max(input.maxSeconds, minSeconds), minSeconds, 60);
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
  const usedOverlays = new Set<string>();

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
          viralBrainPromptContext: input.viralBrainPromptContext,
          viralFormula: input.viralFormula,
          usedTitles: getUsedTextList(usedTitles),
          usedOverlays: getUsedTextList(usedOverlays),
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
        overlayText: normalizeStoryOverlay({
          value: finalReview.overlayText,
          seed: index + finalScore,
          usedOverlays,
          sourceTitle: input.sourceTitle,
          storyStyle: finalReview.storyStyle,
          musicMood: finalReview.musicMood,
          clipIndex: index + 1,
          useEmojis: input.useEmojis ?? true,
          fallbackRole: "hook",
        }),
        conflictText: normalizeStoryOverlay({
          value: finalReview.conflictText,
          seed: index + finalScore + 31,
          usedOverlays,
          sourceTitle: input.sourceTitle,
          storyStyle: finalReview.storyStyle,
          musicMood: finalReview.musicMood,
          clipIndex: index + 1,
          useEmojis: input.useEmojis ?? true,
          fallbackRole: "conflict",
        }),
        escalationText: normalizeStoryOverlay({
          value: finalReview.escalationText,
          seed: index + finalScore + 63,
          usedOverlays,
          sourceTitle: input.sourceTitle,
          storyStyle: finalReview.storyStyle,
          musicMood: finalReview.musicMood,
          clipIndex: index + 1,
          useEmojis: input.useEmojis ?? true,
          fallbackRole: "escalation",
        }),
        punchlineText: normalizeStoryOverlay({
          value: finalReview.punchlineText,
          seed: index + finalScore + 97,
          usedOverlays,
          sourceTitle: input.sourceTitle,
          storyStyle: finalReview.storyStyle,
          musicMood: finalReview.musicMood,
          clipIndex: index + 1,
          useEmojis: input.useEmojis ?? true,
          fallbackRole: "punchline",
        }),
        secondaryText: finalReview.secondaryText,
        title: normalizeTitle({
          value: finalReview.title,
          seed: index + finalScore,
          usedTitles,
          sourceTitle: input.sourceTitle,
          storyStyle: finalReview.storyStyle,
          musicMood: finalReview.musicMood,
          clipIndex: index + 1,
        }),
        description: finalReview.reason,
        storyStyle: finalReview.storyStyle,
        musicMood: finalReview.musicMood,
        reason: [
          `Story AI ${finalReview.score}/100`,
          finalReview.reason,
          `arc hook/conflict/escalation/punchline`,
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
