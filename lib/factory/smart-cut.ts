import { readCommand } from "@/lib/factory/video";

export type FactoryCutMode = "SEQUENTIAL" | "SMART_LITE" | "SMART_HOOK_AI" | "ROBLOX_STORY_AI";

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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
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
