import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Prisma } from "@prisma/client";

import { prisma } from "../prisma";
import { withDbRetry } from "./db-retry";
import { FACTORY_ASSETS_DIR, ensureFactoryDirs } from "./paths";
import { readCommand, runCommand, safeFileName } from "./video";

export const VIRAL_LAB_DIR = path.join(FACTORY_ASSETS_DIR, "viral-lab");
export const VIRAL_REFERENCE_DIR = path.join(VIRAL_LAB_DIR, "references");
export const VIRAL_THUMBNAIL_DIR = path.join(VIRAL_LAB_DIR, "thumbnails");

const OPENAI_MODEL = process.env.OPENAI_VIRAL_LAB_MODEL ?? process.env.OPENAI_STORY_MODEL ?? "gpt-4.1-mini";

export type ViralFormulaContext = {
  id: string;
  name: string;
  hookType: string;
  storyType: string;
  musicMood: string;
  titlePattern: string;
  overlayTextPattern: Prisma.JsonValue;
  emojiPattern: Prisma.JsonValue;
  plotBeats: Prisma.JsonValue;
  pacing: Prisma.JsonValue;
  endingLogic: string;
  confidenceScore: number;
  sourceCount: number;
  notes?: string | null;
};

export type ViralBrainContext = {
  formulas: ViralFormulaContext[];
  snapshot: {
    referencesCount: number;
    formulasCount: number;
    topHookTypes: Prisma.JsonValue;
    topStoryTypes: Prisma.JsonValue;
    topMusicMoods: Prisma.JsonValue;
    titlePatterns: Prisma.JsonValue;
    overlayPatterns: Prisma.JsonValue;
    emojiPatterns: Prisma.JsonValue;
    pacingRules: Prisma.JsonValue;
    endingRules: Prisma.JsonValue;
    promptContext: string;
  } | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text.trim()) as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

function stringValue(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberValue(value: unknown, fallback: number, min = 0, max = 100) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, min, max);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}


export async function ensureViralLabDirs() {
  await ensureFactoryDirs();
  await Promise.all([
    mkdir(VIRAL_LAB_DIR, { recursive: true }),
    mkdir(VIRAL_REFERENCE_DIR, { recursive: true }),
    mkdir(VIRAL_THUMBNAIL_DIR, { recursive: true }),
  ]);
}

export function buildViralReferencePath(originalName: string) {
  const ext = path.extname(originalName).toLowerCase() || ".mp4";
  const base = safeFileName(path.basename(originalName, ext)) || "viral-reference";
  return path.join(VIRAL_REFERENCE_DIR, `${Date.now()}-${nanoid(8)}-${base}${ext}`);
}

export async function getVideoDurationSec(filePath: string) {
  const output = await readCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Math.round(Number(output.trim()));
  return Number.isFinite(duration) ? Math.max(1, duration) : null;
}

export async function createViralThumbnail(input: { referenceId: string; filePath: string }) {
  const outputPath = path.join(VIRAL_THUMBNAIL_DIR, `${input.referenceId}.jpg`);
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "1",
    "-i",
    input.filePath,
    "-frames:v",
    "1",
    "-update",
    "1",
    "-vf",
    "scale=360:-2:force_original_aspect_ratio=decrease",
    "-q:v",
    "4",
    outputPath,
  ]);
  return outputPath;
}

async function extractAnalysisFrames(input: { referenceId: string; filePath: string; durationSec: number }) {
  const framesDir = path.join(VIRAL_THUMBNAIL_DIR, `${input.referenceId}-frames`);
  await mkdir(framesDir, { recursive: true });

  const points = [
    0.8,
    Math.max(1.5, input.durationSec * 0.18),
    Math.max(2, input.durationSec * 0.42),
    Math.max(3, input.durationSec * 0.7),
    Math.max(4, input.durationSec - 1.2),
  ];

  const result: string[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const framePath = path.join(framesDir, `${index}.jpg`);
    await runCommand("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(clamp(Math.round(points[index] * 10) / 10, 0, Math.max(0, input.durationSec - 0.5))),
      "-i",
      input.filePath,
      "-frames:v",
      "1",
      "-update",
      "1",
      "-vf",
      "scale=360:-2:force_original_aspect_ratio=decrease",
      "-q:v",
      "4",
      framePath,
    ]);
    const buffer = await readFile(framePath);
    result.push(`data:image/jpeg;base64,${buffer.toString("base64")}`);
  }

  return result;
}

async function analyzeReferenceWithOpenAi(input: {
  title: string;
  sourceUrl?: string | null;
  durationSec: number;
  frames: string[];
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildFallbackAnalysis(input.title, input.durationSec);
  }

  const content = [
    {
      type: "text",
      text: [
        "You are a viral Roblox Shorts strategist. Analyze this successful reference video only as a pattern source, not for copying.",
        "Extract a reusable Roblox Story Shorts formula: hook, story archetype, plot beats, overlay text style, emoji logic, pacing, music mood, ending logic, title pattern.",
        "The system will later use this analysis to create NEW original Shorts from donor gameplay. Do not tell it to copy the exact video.",
        `Reference title: ${input.title}`,
        `Reference URL: ${input.sourceUrl ?? "uploaded file"}`,
        `Duration: ${input.durationSec}s`,
        "Return strict JSON only with this schema:",
        "{\"hookType\":\"instant_choice|shock_question|system_message|sad_reveal|bully_trigger|gift_mystery|danger_warning|other\",\"hookLengthSec\":1-4,\"storyType\":\"poor_rich|bullied_bacon|love_money|save_mom_or_money|choice_punishment|revenge|gift_betrayal|horror_escape|funny_fail|other\",\"plotStructure\":{\"beat1\":\"hook\",\"beat2\":\"conflict\",\"beat3\":\"escalation\",\"beat4\":\"twist/payoff\"},\"overlayTextStyle\":{\"case\":\"upper\",\"lineCount\":2,\"wordsPerLine\":3,\"placement\":\"center/top\",\"tone\":\"emotional/simple\",\"examples\":[\"...\"]},\"emojiStyle\":{\"density\":\"low|medium|high\",\"emojis\":[\"😳\",\"😭\"],\"rules\":\"...\"},\"pacingStyle\":\"fast_start_then_escalate\",\"musicMood\":\"sad|emotional|suspense|horror|funny|chaos|epic|gift|choice|love|bullying|revenge|system|mystery|surprise|dramatic|chase|hype|other\",\"endingLogic\":\"comment_choice|sad_twist|revenge_payoff|unexpected_betrayal|cliffhanger|other\",\"titlePattern\":\"He picked X instead of Y.. 😭\",\"viralScore\":0-100,\"formulaName\":\"short name\",\"formulaNotes\":\"how to reuse this formula without copying\"}",
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
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI viral reference analysis failed: ${response.status} ${body.slice(0, 700)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const parsed = safeJsonParse(data.choices?.[0]?.message?.content ?? "");
  if (!parsed) return buildFallbackAnalysis(input.title, input.durationSec);
  return normalizeAnalysis(parsed, input.title, input.durationSec);
}

function buildFallbackAnalysis(title: string, durationSec: number) {
  const lower = title.toLowerCase();
  const storyType = lower.includes("rich") || lower.includes("poor") ? "poor_rich" : lower.includes("love") || lower.includes("money") ? "love_money" : lower.includes("bully") || lower.includes("bacon") ? "bullied_bacon" : "choice_punishment";
  const musicMood = storyType === "poor_rich" ? "sad" : storyType === "love_money" ? "emotional" : storyType === "bullied_bacon" ? "revenge" : "suspense";
  return normalizeAnalysis({
    hookType: "shock_question",
    hookLengthSec: Math.min(3, Math.max(1, Math.round(durationSec * 0.1))),
    storyType,
    plotStructure: { beat1: "instant emotional question", beat2: "simple choice/conflict", beat3: "problem escalates", beat4: "twist or comment question" },
    overlayTextStyle: { case: "upper", lineCount: 2, wordsPerLine: 3, placement: "center", tone: "simple emotional", examples: ["WHO WOULD\nYOU SAVE?! 😳"] },
    emojiStyle: { density: "medium", emojis: ["😳", "😭", "💔"], rules: "one emotional emoji cluster after the main hook" },
    pacingStyle: "fast_start_then_escalate",
    musicMood,
    endingLogic: "comment_choice",
    titlePattern: "Who would you save?! 😳💔",
    viralScore: 56,
    formulaName: storyType.replace(/_/g, " "),
    formulaNotes: "Fallback formula based on title and duration. Use as a generic Roblox story pattern.",
  }, title, durationSec);
}

function normalizeAnalysis(raw: Record<string, unknown>, title: string, durationSec: number) {
  const hookType = stringValue(raw.hookType, "shock_question").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const storyType = stringValue(raw.storyType, "choice_punishment").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const musicMood = stringValue(raw.musicMood, "suspense").toLowerCase().replace(/[^a-z0-9_]+/g, "_");

  return {
    hookType,
    hookLengthSec: numberValue(raw.hookLengthSec, Math.min(3, Math.max(1, Math.round(durationSec * 0.12))), 1, 6),
    storyType,
    plotStructure: raw.plotStructure && typeof raw.plotStructure === "object" ? raw.plotStructure : { beat1: "hook", beat2: "conflict", beat3: "escalation", beat4: "payoff" },
    overlayTextStyle: raw.overlayTextStyle && typeof raw.overlayTextStyle === "object" ? raw.overlayTextStyle : { case: "upper", lineCount: 2, placement: "center", examples: [title] },
    emojiStyle: raw.emojiStyle && typeof raw.emojiStyle === "object" ? raw.emojiStyle : { density: "medium", emojis: ["😳", "😭"] },
    pacingStyle: stringValue(raw.pacingStyle, "fast_start_then_escalate"),
    musicMood,
    endingLogic: stringValue(raw.endingLogic, "cliffhanger"),
    titlePattern: stringValue(raw.titlePattern, title || "Roblox story with emotional twist.. 😳"),
    viralScore: numberValue(raw.viralScore, 55, 0, 100),
    formulaName: stringValue(raw.formulaName, `${storyType.replace(/_/g, " ")} / ${hookType.replace(/_/g, " ")}`),
    formulaNotes: stringValue(raw.formulaNotes, "Reusable Roblox story formula extracted from reference."),
    raw,
  };
}

export async function analyzeViralReference(referenceId: string) {
  const reference = await withDbRetry(() => prisma.viralReference.findUnique({ where: { id: referenceId } }));
  if (!reference) throw new Error("Референс не найден");
  if (!reference.filePath) throw new Error("У референса нет локального файла для анализа");

  await withDbRetry(() => prisma.viralReference.update({ where: { id: referenceId }, data: { status: "ANALYZING", errorMessage: null } }));

  try {
    const durationSec = reference.durationSec ?? (await getVideoDurationSec(reference.filePath)) ?? 30;
    let thumbnailPath = reference.thumbnailPath;
    if (!thumbnailPath) {
      thumbnailPath = await createViralThumbnail({ referenceId, filePath: reference.filePath }).catch(() => null);
    }

    const frames = await extractAnalysisFrames({ referenceId, filePath: reference.filePath, durationSec });
    const analysis = await analyzeReferenceWithOpenAi({
      title: reference.title ?? reference.originalName ?? "Roblox viral reference",
      sourceUrl: reference.sourceUrl,
      durationSec,
      frames,
    });

    await withDbRetry(() =>
      prisma.viralReferenceAnalysis.upsert({
        where: { referenceId },
        create: {
          referenceId,
          hookType: analysis.hookType,
          hookLengthSec: analysis.hookLengthSec,
          storyType: analysis.storyType,
          plotStructure: toPrismaJson(analysis.plotStructure),
          overlayTextStyle: toPrismaJson(analysis.overlayTextStyle),
          emojiStyle: toPrismaJson(analysis.emojiStyle),
          pacingStyle: analysis.pacingStyle,
          musicMood: analysis.musicMood,
          endingLogic: analysis.endingLogic,
          titlePattern: analysis.titlePattern,
          viralScore: analysis.viralScore,
          extractedFormula: toPrismaJson({
            formulaName: analysis.formulaName,
            hookType: analysis.hookType,
            storyType: analysis.storyType,
            musicMood: analysis.musicMood,
            titlePattern: analysis.titlePattern,
            plotStructure: analysis.plotStructure,
            overlayTextStyle: analysis.overlayTextStyle,
            emojiStyle: analysis.emojiStyle,
            pacingStyle: analysis.pacingStyle,
            endingLogic: analysis.endingLogic,
            formulaNotes: analysis.formulaNotes,
          }),
          rawAiAnalysis: toPrismaJson(analysis.raw),
        },
        update: {
          hookType: analysis.hookType,
          hookLengthSec: analysis.hookLengthSec,
          storyType: analysis.storyType,
          plotStructure: toPrismaJson(analysis.plotStructure),
          overlayTextStyle: toPrismaJson(analysis.overlayTextStyle),
          emojiStyle: toPrismaJson(analysis.emojiStyle),
          pacingStyle: analysis.pacingStyle,
          musicMood: analysis.musicMood,
          endingLogic: analysis.endingLogic,
          titlePattern: analysis.titlePattern,
          viralScore: analysis.viralScore,
          extractedFormula: toPrismaJson({
            formulaName: analysis.formulaName,
            hookType: analysis.hookType,
            storyType: analysis.storyType,
            musicMood: analysis.musicMood,
            titlePattern: analysis.titlePattern,
            plotStructure: analysis.plotStructure,
            overlayTextStyle: analysis.overlayTextStyle,
            emojiStyle: analysis.emojiStyle,
            pacingStyle: analysis.pacingStyle,
            endingLogic: analysis.endingLogic,
            formulaNotes: analysis.formulaNotes,
          }),
          rawAiAnalysis: toPrismaJson(analysis.raw),
        },
      }),
    );

    const formula = await upsertFormulaFromAnalysis(analysis);

    await withDbRetry(() =>
      prisma.viralReference.update({
        where: { id: referenceId },
        data: {
          durationSec,
          thumbnailPath,
          status: "ANALYZED",
          analyzedAt: new Date(),
          errorMessage: null,
        },
      }),
    );

    await rebuildViralBrainSnapshot("ROBLOX");
    return { analysis, formula };
  } catch (error) {
    await withDbRetry(() =>
      prisma.viralReference.update({
        where: { id: referenceId },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 1500) : "Ошибка анализа" },
      }),
    );
    throw error;
  }
}

async function upsertFormulaFromAnalysis(analysis: ReturnType<typeof normalizeAnalysis>) {
  const existing = await withDbRetry(() =>
    prisma.viralFormula.findFirst({
      where: {
        niche: "ROBLOX",
        storyType: analysis.storyType,
        hookType: analysis.hookType,
        musicMood: analysis.musicMood,
        status: "ACTIVE",
      },
      orderBy: { confidenceScore: "desc" },
    }),
  );

  if (existing) {
    const sourceCount = existing.sourceCount + 1;
    const confidenceScore = clamp(Math.round((existing.confidenceScore * existing.sourceCount + analysis.viralScore) / sourceCount), 0, 100);
    return withDbRetry(() =>
      prisma.viralFormula.update({
        where: { id: existing.id },
        data: {
          name: analysis.formulaName,
          titlePattern: analysis.titlePattern,
          overlayTextPattern: toPrismaJson(analysis.overlayTextStyle),
          emojiPattern: toPrismaJson(analysis.emojiStyle),
          plotBeats: toPrismaJson(analysis.plotStructure),
          pacing: toPrismaJson({ style: analysis.pacingStyle, hookLengthSec: analysis.hookLengthSec }),
          endingLogic: analysis.endingLogic,
          confidenceScore,
          sourceCount,
          notes: analysis.formulaNotes,
        },
      }),
    );
  }

  return withDbRetry(() =>
    prisma.viralFormula.create({
      data: {
        niche: "ROBLOX",
        name: analysis.formulaName,
        hookType: analysis.hookType,
        storyType: analysis.storyType,
        musicMood: analysis.musicMood,
        titlePattern: analysis.titlePattern,
        overlayTextPattern: toPrismaJson(analysis.overlayTextStyle),
        emojiPattern: toPrismaJson(analysis.emojiStyle),
        plotBeats: toPrismaJson(analysis.plotStructure),
        pacing: toPrismaJson({ style: analysis.pacingStyle, hookLengthSec: analysis.hookLengthSec }),
        endingLogic: analysis.endingLogic,
        confidenceScore: analysis.viralScore,
        sourceCount: 1,
        notes: analysis.formulaNotes,
      },
    }),
  );
}

function topCounts(items: Array<string | null | undefined>, limit = 10) {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
}

export async function rebuildViralBrainSnapshot(niche: "ROBLOX" = "ROBLOX") {
  const [referencesCount, analyses, formulas] = await Promise.all([
    withDbRetry(() => prisma.viralReference.count({ where: { niche, status: "ANALYZED" } })),
    withDbRetry(() => prisma.viralReferenceAnalysis.findMany({ orderBy: { viralScore: "desc" }, take: 300 })),
    withDbRetry(() => prisma.viralFormula.findMany({ where: { niche, status: "ACTIVE" }, orderBy: [{ confidenceScore: "desc" }, { sourceCount: "desc" }], take: 80 })),
  ]);

  const topHookTypes = topCounts(analyses.map((item) => item.hookType));
  const topStoryTypes = topCounts(analyses.map((item) => item.storyType));
  const topMusicMoods = topCounts(analyses.map((item) => item.musicMood));
  const titlePatterns = formulas.slice(0, 20).map((item) => ({ pattern: item.titlePattern, storyType: item.storyType, score: item.confidenceScore }));
  const overlayPatterns = formulas.slice(0, 20).map((item) => item.overlayTextPattern);
  const emojiPatterns = formulas.slice(0, 20).map((item) => item.emojiPattern);
  const pacingRules = formulas.slice(0, 20).map((item) => item.pacing);
  const endingRules = topCounts(formulas.map((item) => item.endingLogic));

  const promptContext = [
    "VIRAL LAB BRAIN FOR ROBLOX STORY SHORTS",
    `Analyzed references: ${referencesCount}`,
    `Active formulas: ${formulas.length}`,
    `Top hooks: ${topHookTypes.map((x) => `${x.name}(${x.count})`).join(", ")}`,
    `Top story types: ${topStoryTypes.map((x) => `${x.name}(${x.count})`).join(", ")}`,
    `Top music moods: ${topMusicMoods.map((x) => `${x.name}(${x.count})`).join(", ")}`,
    "Use these as reusable patterns, never as direct copies.",
    "When generating a new Short: match donor gameplay moment to one formula, then create original hook/conflict/escalation/payoff text.",
  ].join("\n");

  return withDbRetry(() =>
    prisma.viralBrainSnapshot.create({
      data: {
        niche,
        referencesCount,
        formulasCount: formulas.length,
        topHookTypes: toPrismaJson(topHookTypes),
        topStoryTypes: toPrismaJson(topStoryTypes),
        topMusicMoods: toPrismaJson(topMusicMoods),
        titlePatterns: toPrismaJson(titlePatterns),
        overlayPatterns: toPrismaJson(overlayPatterns),
        emojiPatterns: toPrismaJson(emojiPatterns),
        pacingRules: toPrismaJson(pacingRules),
        endingRules: toPrismaJson(endingRules),
        promptContext,
        rawSummary: toPrismaJson({ formulaIds: formulas.map((item) => item.id) }),
      },
    }),
  );
}

export async function getViralBrainContext(niche: "ROBLOX" = "ROBLOX"): Promise<ViralBrainContext> {
  const [formulas, snapshot] = await Promise.all([
    withDbRetry(() =>
      prisma.viralFormula.findMany({
        where: { niche, status: "ACTIVE" },
        orderBy: [{ confidenceScore: "desc" }, { sourceCount: "desc" }, { updatedAt: "desc" }],
        take: 25,
      }),
    ),
    withDbRetry(() =>
      prisma.viralBrainSnapshot.findFirst({
        where: { niche },
        orderBy: { createdAt: "desc" },
      }),
    ),
  ]);

  return {
    formulas: formulas.map((formula) => ({
      id: formula.id,
      name: formula.name,
      hookType: formula.hookType,
      storyType: formula.storyType,
      musicMood: formula.musicMood,
      titlePattern: formula.titlePattern,
      overlayTextPattern: formula.overlayTextPattern,
      emojiPattern: formula.emojiPattern,
      plotBeats: formula.plotBeats,
      pacing: formula.pacing,
      endingLogic: formula.endingLogic,
      confidenceScore: formula.confidenceScore,
      sourceCount: formula.sourceCount,
      notes: formula.notes,
    })),
    snapshot: snapshot
      ? {
          referencesCount: snapshot.referencesCount,
          formulasCount: snapshot.formulasCount,
          topHookTypes: snapshot.topHookTypes,
          topStoryTypes: snapshot.topStoryTypes,
          topMusicMoods: snapshot.topMusicMoods,
          titlePatterns: snapshot.titlePatterns,
          overlayPatterns: snapshot.overlayPatterns,
          emojiPatterns: snapshot.emojiPatterns,
          pacingRules: snapshot.pacingRules,
          endingRules: snapshot.endingRules,
          promptContext: snapshot.promptContext,
        }
      : null,
  };
}

export function selectBestFormulaForSource(input: { title?: string | null; formulas: ViralFormulaContext[] }) {
  if (input.formulas.length === 0) return null;
  const title = String(input.title ?? "").toLowerCase();
  let best = input.formulas[0];
  let bestScore = -1;
  for (const formula of input.formulas) {
    let score = formula.confidenceScore + formula.sourceCount * 3;
    for (const token of [formula.storyType, formula.hookType, formula.musicMood]) {
      for (const part of token.split("_")) {
        if (part.length > 3 && title.includes(part)) score += 18;
      }
    }
    if (score > bestScore) {
      best = formula;
      bestScore = score;
    }
  }
  return best;
}

export async function saveUploadedViralFile(input: { file: File; title?: string | null }) {
  await ensureViralLabDirs();
  const filePath = buildViralReferencePath(input.file.name);
  const buffer = Buffer.from(await input.file.arrayBuffer());
  await writeFile(filePath, buffer);
  const durationSec = await getVideoDurationSec(filePath).catch(() => null);

  const reference = await withDbRetry(() =>
    prisma.viralReference.create({
      data: {
        title: input.title || input.file.name.replace(/\.[^.]+$/, ""),
        sourceType: "FILE",
        filePath,
        originalName: input.file.name,
        mimeType: input.file.type || "video/mp4",
        sizeBytes: buffer.byteLength,
        durationSec,
        niche: "ROBLOX",
        status: "QUEUED",
      },
    }),
  );

  const thumbnailPath = await createViralThumbnail({ referenceId: reference.id, filePath }).catch(() => null);
  if (thumbnailPath) {
    await withDbRetry(() => prisma.viralReference.update({ where: { id: reference.id }, data: { thumbnailPath } }));
  }

  return reference;
}
