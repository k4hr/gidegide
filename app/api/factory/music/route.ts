import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { ensureFactoryDirs, FACTORY_TEMP_DIR } from "@/lib/factory/paths";
import { getR2Prefix, uploadBufferToR2, deleteR2Object } from "@/lib/factory/r2";
import { extFromName, safeFileName } from "@/lib/factory/video";
import { withDbRetry } from "@/lib/factory/db-retry";

export const runtime = "nodejs";

export const MUSIC_MOODS = [
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
] as const;

const moodSchema = z.enum(MUSIC_MOODS);

function sanitizeMood(value: unknown) {
  const mood = String(value ?? "").trim().toLowerCase();
  return moodSchema.parse(mood);
}

function serializeTrack(track: {
  id: string;
  title: string;
  mood: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    ...track,
    createdAt: track.createdAt.toISOString(),
  };
}

export async function GET() {
  const tracks = await withDbRetry(() =>
    prisma.factoryMusicTrack.findMany({
      orderBy: [{ mood: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        mood: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        isActive: true,
        createdAt: true,
      },
    }),
  );

  return NextResponse.json({
    moods: MUSIC_MOODS,
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
        },
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
    const body = z.object({ id: z.string().min(1), isActive: z.boolean() }).parse(await request.json());
    const track = await withDbRetry(() =>
      prisma.factoryMusicTrack.update({
        where: { id: body.id },
        data: { isActive: body.isActive },
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
