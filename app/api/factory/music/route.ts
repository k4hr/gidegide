import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";
import { ensureFactoryDirs, FACTORY_TEMP_DIR } from "../../../../lib/factory/paths";
import { getR2Prefix, uploadBufferToR2, deleteR2Object } from "../../../../lib/factory/r2";
import { extFromName, safeFileName } from "../../../../lib/factory/video";
import { withDbRetry } from "../../../../lib/factory/db-retry";

import {
  COPYRIGHT_STATUSES,
  MUSIC_LICENSE_TYPES,
  MUSIC_MOODS,
  MUSIC_SOURCES,
  riskScoreForMusicCopyrightStatus,
} from "../../../../lib/factory/music-library";

export const runtime = "nodejs";

const moodSchema = z.enum(MUSIC_MOODS);
const copyrightStatusSchema = z.enum(COPYRIGHT_STATUSES);
const musicSourceSchema = z.enum(MUSIC_SOURCES);
const licenseTypeSchema = z.enum(MUSIC_LICENSE_TYPES);

const patchSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
  copyrightStatus: copyrightStatusSchema.optional(),
  musicSource: musicSourceSchema.optional(),
  licenseType: licenseTypeSchema.optional(),
  artist: z.string().trim().max(180).nullable().optional(),
  sourceUrl: z.string().trim().max(500).nullable().optional(),
  needsAttribution: z.boolean().optional(),
  attributionText: z.string().trim().max(1000).nullable().optional(),
  riskScore: z.coerce.number().int().min(0).max(100).optional(),
  blockedReason: z.string().trim().max(1000).nullable().optional(),
});

function sanitizeMood(value: unknown) {
  const mood = String(value ?? "").trim().toLowerCase();
  return moodSchema.parse(mood);
}

function normalizeOptionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function deriveSafety(input: {
  musicSource: string;
  licenseType: string;
  copyrightStatus: string;
}) {
  if (input.copyrightStatus !== "UNKNOWN") {
    return input.copyrightStatus;
  }

  if (
    input.musicSource === "YOUTUBE_AUDIO_LIBRARY" &&
    input.licenseType === "ATTRIBUTION_NOT_REQUIRED"
  ) {
    return "SAFE_YOUTUBE_AUDIO_LIBRARY";
  }

  if (input.musicSource === "OWNED" || input.licenseType === "OWNED") {
    return "SAFE_OWNED";
  }

  if (input.musicSource === "ROYALTY_FREE") {
    return "SAFE_ROYALTY_FREE";
  }

  return "UNKNOWN";
}

function serializeTrack(track: {
  id: string;
  title: string;
  mood: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  copyrightStatus: string;
  musicSource: string;
  licenseType: string;
  artist: string | null;
  sourceUrl: string | null;
  needsAttribution: boolean;
  attributionText: string | null;
  riskScore: number;
  blockedReason: string | null;
  confirmedSafeAt: Date | null;
  lastClaimAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...track,
    createdAt: track.createdAt.toISOString(),
    confirmedSafeAt: track.confirmedSafeAt?.toISOString() ?? null,
    lastClaimAt: track.lastClaimAt?.toISOString() ?? null,
  };
}

const trackSelect = {
  id: true,
  title: true,
  mood: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  isActive: true,
  copyrightStatus: true,
  musicSource: true,
  licenseType: true,
  artist: true,
  sourceUrl: true,
  needsAttribution: true,
  attributionText: true,
  riskScore: true,
  blockedReason: true,
  confirmedSafeAt: true,
  lastClaimAt: true,
  createdAt: true,
} as const;

export async function GET() {
  const tracks = await withDbRetry(() =>
    prisma.factoryMusicTrack.findMany({
      orderBy: [{ mood: "asc" }, { createdAt: "desc" }],
      select: trackSelect,
    }),
  );

  return NextResponse.json({
    moods: MUSIC_MOODS,
    copyrightStatuses: COPYRIGHT_STATUSES,
    musicSources: MUSIC_SOURCES,
    licenseTypes: MUSIC_LICENSE_TYPES,
    tracks: tracks.map(serializeTrack),
  });
}

export async function POST(request: Request) {
  try {
    await ensureFactoryDirs();
    const formData = await request.formData();
    const mood = sanitizeMood(formData.get("mood"));
    const title = String(formData.get("title") ?? "").trim();
    const file = formData.get("file");

    const musicSource = musicSourceSchema.parse(
      String(formData.get("musicSource") ?? "UNKNOWN").trim() || "UNKNOWN",
    );
    const licenseType = licenseTypeSchema.parse(
      String(formData.get("licenseType") ?? "UNKNOWN").trim() || "UNKNOWN",
    );
    const requestedStatus = copyrightStatusSchema.parse(
      String(formData.get("copyrightStatus") ?? "UNKNOWN").trim() || "UNKNOWN",
    );
    const copyrightStatus = deriveSafety({ musicSource, licenseType, copyrightStatus: requestedStatus });
    const needsAttribution = String(formData.get("needsAttribution") ?? "false") === "true";
    const artist = normalizeOptionalText(formData.get("artist"));
    const sourceUrl = normalizeOptionalText(formData.get("sourceUrl"));
    const attributionText = normalizeOptionalText(formData.get("attributionText"));

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Загрузи аудио-файл" }, { status: 400 });
    }

    const originalName = file.name || "music.mp3";
    const ext = extFromName(originalName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeTitle = safeFileName(title || originalName.replace(/\.[^.]+$/, "")) || "music";
    const fileName = `${Date.now()}-${safeTitle}${ext}`;
    const storageKey = `${getR2Prefix()}/music/${mood}/${fileName}`;
    const localPath = path.join(FACTORY_TEMP_DIR, "music", mood, fileName);

    await mkdir(path.dirname(localPath), { recursive: true });
    await writeFile(localPath, buffer);

    const uploadedKey = await uploadBufferToR2({
      key: storageKey,
      buffer,
      contentType: file.type || "audio/mpeg",
    });

    const track = await withDbRetry(() =>
      prisma.factoryMusicTrack.create({
        data: {
          title: title || originalName.replace(/\.[^.]+$/, ""),
          mood,
          filePath: localPath,
          storageKey: uploadedKey,
          originalName,
          mimeType: file.type || "audio/mpeg",
          sizeBytes: file.size,
          isActive: true,
          copyrightStatus,
          musicSource,
          licenseType,
          artist,
          sourceUrl,
          needsAttribution,
          attributionText,
          riskScore: riskScoreForMusicCopyrightStatus(copyrightStatus),
          confirmedSafeAt: copyrightStatus.startsWith("SAFE_") ? new Date() : null,
        },
        select: trackSelect,
      }),
    );

    return NextResponse.json({ track: serializeTrack(track) });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось загрузить музыку" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = patchSchema.parse(await request.json());
    const data: Record<string, unknown> = {};

    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (body.musicSource) data.musicSource = body.musicSource;
    if (body.licenseType) data.licenseType = body.licenseType;
    if (typeof body.artist !== "undefined") data.artist = body.artist || null;
    if (typeof body.sourceUrl !== "undefined") data.sourceUrl = body.sourceUrl || null;
    if (typeof body.needsAttribution === "boolean") data.needsAttribution = body.needsAttribution;
    if (typeof body.attributionText !== "undefined") data.attributionText = body.attributionText || null;
    if (typeof body.blockedReason !== "undefined") data.blockedReason = body.blockedReason || null;

    if (body.copyrightStatus) {
      data.copyrightStatus = body.copyrightStatus;
      data.riskScore = body.riskScore ?? riskScoreForMusicCopyrightStatus(body.copyrightStatus);
      if (body.copyrightStatus.startsWith("SAFE_")) {
        data.confirmedSafeAt = new Date();
        data.lastClaimAt = null;
      }
      if (body.copyrightStatus === "BLOCKED" || body.copyrightStatus === "RISKY") {
        data.confirmedSafeAt = null;
      }
      if (body.copyrightStatus === "BLOCKED") {
        data.isActive = false;
        data.lastClaimAt = new Date();
        data.riskScore = 100;
      }
    }

    if (typeof body.riskScore === "number" && !body.copyrightStatus) data.riskScore = body.riskScore;

    const track = await withDbRetry(() =>
      prisma.factoryMusicTrack.update({
        where: { id: body.id },
        data,
        select: trackSelect,
      }),
    );

    return NextResponse.json({ track: serializeTrack(track) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось обновить музыку" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Не передан id" }, { status: 400 });
    }

    const track = await withDbRetry(() => prisma.factoryMusicTrack.findUnique({ where: { id } }));

    if (!track) {
      return NextResponse.json({ ok: true });
    }

    await deleteR2Object(track.storageKey);
    await withDbRetry(() => prisma.factoryMusicTrack.delete({ where: { id } }));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось удалить музыку" },
      { status: 500 },
    );
  }
}
