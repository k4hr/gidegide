import { readCommand } from "@/lib/factory/video";

export type FactoryCutMode =
  | "SEQUENTIAL"
  | "SMART_LITE"
  | "SMART_HOOK_AI"
  | "ROBLOX_STORY_AI"
  | "MOVIE_SMART";

export type SmartCutCandidate = {
  startSec: number;
  endSec: number;
  durationSec: number;
  motionScore: number;
  audioScore: number;
  firstFrameScore: number;
  sceneScore: number;
  finalScore: number;
  selected: boolean;
  reason: string;
};

type SmartCutInput = {
  sourcePath: string;
  duration: number;
  clipSeconds: number;
  maxClips: number;
  stepSeconds: number;
  maxCandidates: number;
  minGapSeconds: number;
  clipStartIndex?: number;
  onProgress?: (progress: number, label: string) => Promise<void>;
  isCanceled?: () => Promise<boolean>;
};

type MovieSmartCutInput = {
  sourcePath: string;
  duration: number;
  clipSeconds?: number;
  maxClips: number;
  windowSeconds?: number;
  windowsPerMovie?: number;
  windowStepSeconds?: number;
  skipIntroSeconds?: number;
  skipOutroSeconds?: number;
  minGapBetweenWindowsSeconds?: number;
  onProgress?: (progress: number, label: string) => Promise<void>;
  isCanceled?: () => Promise<boolean>;
};

type MovieWindowCandidate = {
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getEnvNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function formatTimestamp(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

async function assertNotCanceled(isCanceled?: () => Promise<boolean>) {
  if (await isCanceled?.()) {
    throw new Error("Задача отменена пользователем");
  }
}

function getNumberMatch(text: string, pattern: RegExp) {
  const match = text.match(pattern);

  if (!match?.[1]) {
    return null;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value)) {
    return null;
  }

  return value;
}

async function readFfmpegOutput(args: string[]) {
  const escapedArgs = args.map((arg) => {
    if (/^[a-zA-Z0-9_./:=,+-]+$/.test(arg)) {
      return arg;
    }

    return `'${arg.replace(/'/g, "'\\''")}'`;
  });

  return readCommand("bash", ["-lc", `ffmpeg ${escapedArgs.join(" ")} 2>&1`]);
}

async function getAudioScore(input: {
  sourcePath: string;
  startSec: number;
  durationSec: number;
}) {
  try {
    const output = await readFfmpegOutput([
      "-hide_banner",
      "-nostats",
      "-ss",
      String(input.startSec),
      "-t",
      String(Math.min(input.durationSec, 12)),
      "-i",
      input.sourcePath,
      "-vn",
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]);

    const meanVolume = getNumberMatch(
      output,
      /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i,
    );
    const maxVolume = getNumberMatch(
      output,
      /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i,
    );

    if (meanVolume === null && maxVolume === null) {
      return {
        score: 35,
        reason: "звук не удалось точно оценить",
      };
    }

    let score = 40;

    if (maxVolume !== null) {
      if (maxVolume >= -6) score += 35;
      else if (maxVolume >= -12) score += 28;
      else if (maxVolume >= -18) score += 18;
      else if (maxVolume >= -26) score += 8;
      else score -= 20;
    }

    if (meanVolume !== null) {
      if (meanVolume >= -18) score += 20;
      else if (meanVolume >= -26) score += 12;
      else if (meanVolume >= -34) score += 4;
      else score -= 25;
    }

    return {
      score: clampScore(score),
      reason:
        meanVolume !== null && maxVolume !== null
          ? `звук mean ${meanVolume.toFixed(1)} dB, max ${maxVolume.toFixed(1)} dB`
          : "звук найден",
    };
  } catch {
    return {
      score: 20,
      reason: "звук слабый или не прочитан",
    };
  }
}

async function getMotionAndSceneScore(input: {
  sourcePath: string;
  startSec: number;
  durationSec: number;
}) {
  try {
    const output = await readFfmpegOutput([
      "-hide_banner",
      "-nostats",
      "-ss",
      String(input.startSec),
      "-t",
      String(Math.min(input.durationSec, 14)),
      "-i",
      input.sourcePath,
      "-vf",
      "select='gt(scene,0.035)',showinfo",
      "-an",
      "-f",
      "null",
      "-",
    ]);

    const sceneMatches = output.match(/pts_time:/g) ?? [];
    const sceneCount = sceneMatches.length;

    const motionScore = clampScore(30 + sceneCount * 14);
    const sceneScore = clampScore(25 + sceneCount * 18);

    return {
      motionScore,
      sceneScore,
      reason: `${sceneCount} заметных изменений сцены`,
    };
  } catch {
    return {
      motionScore: 40,
      sceneScore: 35,
      reason: "движение оценено базово",
    };
  }
}

async function getFirstFrameScore(input: {
  sourcePath: string;
  startSec: number;
}) {
  try {
    const output = await readFfmpegOutput([
      "-hide_banner",
      "-nostats",
      "-ss",
      String(input.startSec),
      "-t",
      "2",
      "-i",
      input.sourcePath,
      "-vf",
      "blackdetect=d=0.4:pic_th=0.92:pix_th=0.10",
      "-an",
      "-f",
      "null",
      "-",
    ]);

    const hasBlack = /black_start:/i.test(output);

    if (hasBlack) {
      return {
        score: 15,
        reason: "старт похож на черный/темный экран",
      };
    }

    return {
      score: 72,
      reason: "стартовый кадр не черный",
    };
  } catch {
    return {
      score: 55,
      reason: "стартовый кадр оценен базово",
    };
  }
}

async function analyzeCandidate(input: {
  sourcePath: string;
  startSec: number;
  clipSeconds: number;
}) {
  const endSec = input.startSec + input.clipSeconds;

  const [audio, motion, firstFrame] = await Promise.all([
    getAudioScore({
      sourcePath: input.sourcePath,
      startSec: input.startSec,
      durationSec: input.clipSeconds,
    }),
    getMotionAndSceneScore({
      sourcePath: input.sourcePath,
      startSec: input.startSec,
      durationSec: input.clipSeconds,
    }),
    getFirstFrameScore({
      sourcePath: input.sourcePath,
      startSec: input.startSec,
    }),
  ]);

  const finalScore = clampScore(
    motion.motionScore * 0.38 +
      audio.score * 0.27 +
      firstFrame.score * 0.22 +
      motion.sceneScore * 0.13,
  );

  return {
    startSec: input.startSec,
    endSec,
    durationSec: input.clipSeconds,
    motionScore: motion.motionScore,
    audioScore: audio.score,
    firstFrameScore: firstFrame.score,
    sceneScore: motion.sceneScore,
    finalScore,
    selected: false,
    reason: [
      motion.reason,
      audio.reason,
      firstFrame.reason,
      `final score ${finalScore}`,
    ].join(" · "),
  } satisfies SmartCutCandidate;
}

function hasStrongOverlap(
  candidate: SmartCutCandidate,
  selected: SmartCutCandidate[],
  minGapSeconds: number,
) {
  return selected.some(
    (item) => Math.abs(item.startSec - candidate.startSec) < minGapSeconds,
  );
}

function selectBestCandidates(input: {
  candidates: SmartCutCandidate[];
  maxClips: number;
  minGapSeconds: number;
}) {
  const sorted = [...input.candidates].sort(
    (a, b) => b.finalScore - a.finalScore,
  );

  const selected: SmartCutCandidate[] = [];

  for (const candidate of sorted) {
    if (selected.length >= input.maxClips) {
      break;
    }

    if (hasStrongOverlap(candidate, selected, input.minGapSeconds)) {
      continue;
    }

    selected.push({
      ...candidate,
      selected: true,
    });
  }

  const selectedKeys = new Set(selected.map((item) => item.startSec));

  return input.candidates
    .map((candidate) => ({
      ...candidate,
      selected: selectedKeys.has(candidate.startSec),
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

export function buildSequentialClipStarts(input: {
  duration: number;
  clipSeconds: number;
  maxClips: number;
  clipStartIndex?: number;
}) {
  const clipStarts: number[] = [];
  const clipStartIndex = Math.max(0, input.clipStartIndex ?? 0);
  const firstStartSec = clipStartIndex * input.clipSeconds;

  for (
    let startSec = firstStartSec;
    startSec + input.clipSeconds <= input.duration &&
    clipStarts.length < input.maxClips;
    startSec += input.clipSeconds
  ) {
    clipStarts.push(startSec);
  }

  return clipStarts;
}

export async function buildSmartClipCandidates(input: SmartCutInput) {
  const candidates: SmartCutCandidate[] = [];
  const stepSeconds = Math.max(5, input.stepSeconds);
  const maxCandidates = Math.max(10, input.maxCandidates);
  const offset = Math.max(0, input.clipStartIndex ?? 0);

  let checked = 0;

  for (
    let startSec = 0;
    startSec + input.clipSeconds <= input.duration &&
    candidates.length < maxCandidates;
    startSec += stepSeconds
  ) {
    await assertNotCanceled(input.isCanceled);

    if (checked < offset) {
      checked += 1;
      continue;
    }

    const visibleIndex = candidates.length + 1;

    await input.onProgress?.(
      31 + Math.min(24, Math.round((visibleIndex / maxCandidates) * 24)),
      `Smart Cut Lite: анализ кандидата ${visibleIndex}/${maxCandidates}`,
    );

    const candidate = await analyzeCandidate({
      sourcePath: input.sourcePath,
      startSec,
      clipSeconds: input.clipSeconds,
    });

    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return [];
  }

  return selectBestCandidates({
    candidates,
    maxClips: input.maxClips,
    minGapSeconds: Math.max(input.clipSeconds, input.minGapSeconds),
  });
}

export async function buildSmartClipStarts(input: SmartCutInput) {
  const candidates = await buildSmartClipCandidates(input);

  return candidates
    .filter((candidate) => candidate.selected)
    .sort((a, b) => a.startSec - b.startSec)
    .map((candidate) => candidate.startSec);
}

async function analyzeMovieWindow(input: {
  sourcePath: string;
  startSec: number;
  windowSeconds: number;
  clipSeconds: number;
}) {
  const sampleDuration = Math.max(20, Math.min(60, input.clipSeconds));
  const sampleStarts = [
    input.startSec,
    input.startSec + Math.max(0, Math.floor(input.windowSeconds / 2) - Math.floor(sampleDuration / 2)),
    input.startSec + Math.max(0, input.windowSeconds - sampleDuration - 2),
  ];

  const samples = await Promise.all(
    sampleStarts.map((startSec) =>
      analyzeCandidate({
        sourcePath: input.sourcePath,
        startSec: Math.max(0, Math.round(startSec)),
        clipSeconds: sampleDuration,
      }),
    ),
  );

  const score = clampScore(
    samples.reduce((sum, sample) => sum + sample.finalScore, 0) /
      Math.max(1, samples.length),
  );

  return {
    startSec: Math.round(input.startSec),
    endSec: Math.round(input.startSec + input.windowSeconds),
    score,
    reason: samples.map((sample) => sample.reason).join(" | "),
  } satisfies MovieWindowCandidate;
}

function overlapsMovieWindow(
  candidate: MovieWindowCandidate,
  selected: MovieWindowCandidate[],
  minGapSeconds: number,
) {
  return selected.some((item) => {
    const left = Math.max(candidate.startSec, item.startSec);
    const right = Math.min(candidate.endSec, item.endSec);
    const overlaps = left < right;
    const tooClose = Math.abs(candidate.startSec - item.startSec) < minGapSeconds;
    return overlaps || tooClose;
  });
}

function buildMovieCandidateStarts(input: {
  safeStart: number;
  safeEnd: number;
  clipSeconds: number;
  stepSeconds: number;
  maxCandidates: number;
}) {
  const lastStart = Math.max(input.safeStart, input.safeEnd - input.clipSeconds);
  const starts: number[] = [];

  for (let startSec = input.safeStart; startSec <= lastStart; startSec += input.stepSeconds) {
    starts.push(Math.round(startSec));
  }

  if (starts.length <= input.maxCandidates) {
    return starts;
  }

  const sampled: number[] = [];
  const lastIndex = starts.length - 1;

  for (let index = 0; index < input.maxCandidates; index += 1) {
    const sourceIndex = Math.round((index / Math.max(1, input.maxCandidates - 1)) * lastIndex);
    const value = starts[sourceIndex];

    if (!sampled.includes(value)) {
      sampled.push(value);
    }
  }

  return sampled.sort((a, b) => a - b);
}

function tuneMovieMomentCandidate(candidate: SmartCutCandidate) {
  let score = candidate.finalScore;
  const reasons = [candidate.reason];

  if (candidate.audioScore >= 78) {
    score += 10;
    reasons.push("громкий/эмоциональный звук");
  } else if (candidate.audioScore < 35) {
    score -= 22;
    reasons.push("слишком тихий фрагмент");
  }

  if (candidate.motionScore >= 74 || candidate.sceneScore >= 74) {
    score += 12;
    reasons.push("много движения или смен кадров");
  } else if (candidate.motionScore < 38 && candidate.sceneScore < 45) {
    score -= 18;
    reasons.push("мало визуальной динамики");
  }

  if (candidate.firstFrameScore < 30) {
    score -= 16;
    reasons.push("слабый/темный старт кадра");
  } else if (candidate.firstFrameScore >= 70) {
    score += 5;
    reasons.push("старт кадра чистый");
  }

  if (candidate.audioScore >= 58 && (candidate.motionScore >= 58 || candidate.sceneScore >= 58)) {
    score += 8;
    reasons.push("есть и звук, и визуальный конфликт");
  }

  return {
    ...candidate,
    finalScore: clampScore(score),
    reason: reasons.join(" · "),
  } satisfies SmartCutCandidate;
}

function selectMovieMomentCandidates(input: {
  candidates: SmartCutCandidate[];
  maxClips: number;
  minGapSeconds: number;
  relaxedGapSeconds: number;
}) {
  const sorted = [...input.candidates].sort((a, b) => b.finalScore - a.finalScore);
  const selected: SmartCutCandidate[] = [];

  for (const candidate of sorted) {
    if (selected.length >= input.maxClips) break;
    if (hasStrongOverlap(candidate, selected, input.minGapSeconds)) continue;
    selected.push({ ...candidate, selected: true });
  }

  if (selected.length < input.maxClips) {
    for (const candidate of sorted) {
      if (selected.length >= input.maxClips) break;
      if (selected.some((item) => item.startSec === candidate.startSec)) continue;
      if (hasStrongOverlap(candidate, selected, input.relaxedGapSeconds)) continue;
      selected.push({ ...candidate, selected: true });
    }
  }

  const selectedKeys = new Set(selected.map((item) => item.startSec));

  return input.candidates
    .map((candidate) => ({
      ...candidate,
      selected: selectedKeys.has(candidate.startSec),
    }))
    .sort((a, b) => a.startSec - b.startSec);
}

export async function buildMovieSmartClipCandidates(input: MovieSmartCutInput) {
  const clipSeconds = Math.max(15, Math.min(90, input.clipSeconds ?? 60));
  const maxClips = Math.max(1, input.maxClips);

  const skipIntroSeconds = Math.min(
    Math.max(60, input.skipIntroSeconds ?? getEnvNumber("MOVIE_SMART_SKIP_INTRO_SECONDS", 240, 0, 1800)),
    Math.floor(input.duration * 0.12),
  );
  const skipOutroSeconds = Math.min(
    Math.max(60, input.skipOutroSeconds ?? getEnvNumber("MOVIE_SMART_SKIP_OUTRO_SECONDS", 240, 0, 1800)),
    Math.floor(input.duration * 0.12),
  );

  let safeStart = Math.max(0, skipIntroSeconds);
  let safeEnd = Math.max(0, input.duration - skipOutroSeconds);

  if (safeEnd - safeStart < clipSeconds * 3) {
    safeStart = 0;
    safeEnd = input.duration;
  }

  const stepSeconds = getEnvNumber(
    "MOVIE_SMART_CANDIDATE_STEP_SECONDS",
    Math.max(20, Math.min(60, input.windowStepSeconds ?? Math.floor(clipSeconds / 2))),
    10,
    180,
  );
  const maxCandidates = getEnvNumber(
    "MOVIE_SMART_MAX_CANDIDATES",
    Math.max(maxClips * 12, 90),
    Math.max(maxClips * 3, 20),
    220,
  );
  const minScore = getEnvNumber("MOVIE_SMART_MIN_SCORE", 48, 0, 100);
  const minGapSeconds = Math.max(
    clipSeconds * 2,
    input.minGapBetweenWindowsSeconds ?? getEnvNumber("MOVIE_SMART_MIN_GAP_SECONDS", 420, clipSeconds, 1800),
  );
  const relaxedGapSeconds = Math.max(clipSeconds, Math.floor(minGapSeconds / 2));

  const starts = buildMovieCandidateStarts({
    safeStart,
    safeEnd,
    clipSeconds,
    stepSeconds,
    maxCandidates,
  });

  const candidates: SmartCutCandidate[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    await assertNotCanceled(input.isCanceled);

    const startSec = starts[index];

    await input.onProgress?.(
      31 + Math.min(24, Math.round(((index + 1) / Math.max(1, starts.length)) * 24)),
      `Movie Smart 2.0: анализирую момент ${index + 1}/${starts.length} (${formatTimestamp(startSec)})`,
    );

    const candidate = tuneMovieMomentCandidate(
      await analyzeCandidate({
        sourcePath: input.sourcePath,
        startSec,
        clipSeconds,
      }),
    );

    candidates.push(candidate);
  }

  const strongCandidates = candidates.filter((candidate) => candidate.finalScore >= minScore);
  const sourceCandidates = strongCandidates.length >= maxClips ? strongCandidates : candidates;

  if (sourceCandidates.length === 0) {
    return [];
  }

  return selectMovieMomentCandidates({
    candidates: sourceCandidates,
    maxClips,
    minGapSeconds,
    relaxedGapSeconds,
  });
}

export async function buildMovieSmartClipStarts(input: MovieSmartCutInput) {
  const candidates = await buildMovieSmartClipCandidates(input);
  const selectedStarts = candidates
    .filter((candidate) => candidate.selected)
    .sort((a, b) => a.startSec - b.startSec)
    .slice(0, Math.max(1, input.maxClips))
    .map((candidate) => candidate.startSec);

  if (selectedStarts.length > 0) {
    await input.onProgress?.(
      55,
      `Movie Smart 2.0: выбрано сильных моментов ${selectedStarts.length}/${input.maxClips}`,
    );

    return selectedStarts;
  }

  return buildSequentialClipStarts({
    duration: input.duration,
    clipSeconds: Math.max(15, Math.min(90, input.clipSeconds ?? 60)),
    maxClips: input.maxClips,
    clipStartIndex: 0,
  });
}
