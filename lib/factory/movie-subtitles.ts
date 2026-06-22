import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";

import { MOVIE_SMART_CONFIG } from "@/lib/factory/movie-smart-config";
import { FACTORY_TEMP_DIR } from "@/lib/factory/paths";
import { runCommand } from "@/lib/factory/video";

type CancelCheck = () => Promise<boolean>;
type ProgressCallback = (progress: number, label: string) => Promise<void>;

type TranscriptionSegment = {
  start?: number;
  end?: number;
  text?: string;
};

type TranscriptionResponse = {
  text?: string;
  segments?: TranscriptionSegment[];
};

type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

function cleanSubtitleText(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function secondsToAssTime(value: number) {
  const safe = Math.max(0, value);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const centiseconds = Math.floor((safe - Math.floor(safe)) * 100);

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  return value
    .replace(/[{}]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "‚")
    .trim();
}

function splitWordsIntoLines(words: string[]) {
  const maxLines = MOVIE_SMART_CONFIG.subtitleMaxLines;
  const maxWordsPerLine = 5;
  const lines: string[] = [];

  for (
    let index = 0;
    index < words.length && lines.length < maxLines;
    index += maxWordsPerLine
  ) {
    lines.push(words.slice(index, index + maxWordsPerLine).join(" "));
  }

  return lines.join("\\N");
}

function splitSegmentIntoCues(segment: TranscriptionSegment): SubtitleCue[] {
  const text = cleanSubtitleText(segment.text ?? "");
  const start = Number(segment.start);
  const end = Number(segment.end);

  if (
    !text ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return [];
  }

  const words = text.split(/\s+/).filter(Boolean);
  const wordsPerCue = 8;
  const cueCount = Math.max(1, Math.ceil(words.length / wordsPerCue));
  const duration = end - start;
  const cues: SubtitleCue[] = [];

  for (let index = 0; index < cueCount; index += 1) {
    const cueWords = words.slice(
      index * wordsPerCue,
      (index + 1) * wordsPerCue,
    );
    if (cueWords.length === 0) continue;

    const cueStart = start + (duration * index) / cueCount;
    const cueEnd =
      index === cueCount - 1
        ? end
        : start + (duration * (index + 1)) / cueCount;

    cues.push({
      start: cueStart,
      end: Math.max(cueStart + 0.8, cueEnd),
      text: splitWordsIntoLines(cueWords),
    });
  }

  return cues;
}

function buildAssFile(cues: SubtitleCue[]) {
  const fontSize = MOVIE_SMART_CONFIG.subtitleFontSize;
  const outline = MOVIE_SMART_CONFIG.subtitleOutline;

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Arial,${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},1,2,60,60,190,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  const events = cues.map(
    (cue) =>
      `Dialogue: 0,${secondsToAssTime(cue.start)},${secondsToAssTime(cue.end)},Default,,0,0,0,,${escapeAssText(cue.text)}`,
  );

  return [...header, ...events, ""].join("\n");
}

function escapeSubtitleFilterPath(filePath: string) {
  return filePath
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

async function transcribeAudio(
  wavPath: string,
): Promise<TranscriptionResponse | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    console.log("[SUBTITLES] skipped: transcription provider unavailable");
    return null;
  }

  const form = new FormData();
  const bytes = await readFile(wavPath);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const audioBlob = new Blob([arrayBuffer], { type: "audio/wav" });

  form.append("file", audioBlob, "clip.wav");
  form.append("model", "whisper-1");
  form.append("language", MOVIE_SMART_CONFIG.subtitlesLanguage);
  form.append("response_format", "verbose_json");

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenAI transcription failed ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  return (await response.json()) as TranscriptionResponse;
}

export function areMovieSubtitlesEnabled() {
  return MOVIE_SMART_CONFIG.subtitlesEnabled;
}

export async function burnMovieSubtitles(input: {
  inputPath: string;
  outputPath: string;
  isCanceled?: CancelCheck;
  onProgress?: ProgressCallback;
}) {
  if (!MOVIE_SMART_CONFIG.subtitlesEnabled) {
    return false;
  }

  if (!existsSync(input.inputPath)) {
    throw new Error(
      `Input video file not found for subtitles: ${input.inputPath}`,
    );
  }

  const tempDir = path.join(FACTORY_TEMP_DIR, `subtitles-${nanoid(8)}`);
  await mkdir(tempDir, { recursive: true });

  const wavPath = path.join(tempDir, "clip.wav");
  const assPath = path.join(tempDir, "clip.ass");

  try {
    console.log("[SUBTITLES] enabled");
    await input.onProgress?.(68, "Генерирую субтитры");

    console.log("[SUBTITLES] extracting audio");
    await runCommand(
      "ffmpeg",
      ["-y", "-i", input.inputPath, "-vn", "-ac", "1", "-ar", "16000", wavPath],
      {
        logPrefix: "movie-subtitles-audio",
        isCanceled: input.isCanceled,
      },
    );

    console.log("[SUBTITLES] transcribing");
    const transcription = await transcribeAudio(wavPath);

    if (!transcription) {
      return false;
    }

    const cues = (transcription.segments ?? [])
      .flatMap(splitSegmentIntoCues)
      .filter((cue) => cue.text.length > 0);

    if (cues.length === 0) {
      console.log("[SUBTITLES] skipped: no speech segments");
      return false;
    }

    await writeFile(assPath, buildAssFile(cues), "utf8");
    console.log("[SUBTITLES] ass created", {
      path: assPath,
      cues: cues.length,
    });

    await input.onProgress?.(70, "Накладываю субтитры");
    console.log("[SUBTITLES] burn start");

    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-i",
        input.inputPath,
        "-vf",
        `subtitles='${escapeSubtitleFilterPath(assPath)}'`,
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        input.outputPath,
      ],
      {
        logPrefix: "movie-subtitles-burn",
        isCanceled: input.isCanceled,
      },
    );

    console.log("[SUBTITLES] burn done", { outputPath: input.outputPath });
    return true;
  } catch (error) {
    if (!MOVIE_SMART_CONFIG.subtitlesSoftFail) {
      throw error;
    }

    console.warn("[SUBTITLES] skipped", error);
    return false;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
