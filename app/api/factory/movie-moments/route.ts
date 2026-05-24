import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { FACTORY_SOURCE_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { extFromName, safeFileName } from "@/lib/factory/video";
import { getR2Prefix, uploadBufferToR2 } from "@/lib/factory/r2";
import { encodeMovieMomentsPrefix } from "@/lib/factory/movie-moments";

export const runtime = "nodejs";

function parseScheduledAt(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Некорректное время публикации");
  return date;
}

function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function saveUploadedMovie(input: { file: File; jobSeed: string }) {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const ext = extFromName(input.file.name);
  const fileName = `${input.jobSeed}-${safeFileName(input.file.name)}${ext}`;
  const localPath = path.join(FACTORY_SOURCE_DIR, fileName);

  await writeFile(localPath, buffer);

  const storageKey = `${getR2Prefix()}/movie-moments/${input.jobSeed}/source/${fileName}`;
  const uploadedKey = await uploadBufferToR2({
    key: storageKey,
    buffer,
    contentType: input.file.type || "video/mp4",
  });

  return {
    localPath,
    storageKey: uploadedKey,
    originalName: input.file.name,
    sizeBytes: buffer.byteLength,
  };
}

export async function POST(request: Request) {
  try {
    await ensureFactoryDirs();
    const formData = await request.formData();

    const movieTitle = z.string().min(1).max(120).parse(formData.get("movieTitle"));
    const description = z.string().max(5000).parse(String(formData.get("description") ?? ""));
    const accountId = z.string().min(1).parse(formData.get("accountId"));
    const templateId = z.string().min(1).parse(formData.get("templateId"));
    const clipCount = Math.max(1, Math.min(12, Math.round(parseNumber(formData.get("clipCount"), 4))));
    const clipSeconds = Math.max(10, Math.min(60, Math.round(parseNumber(formData.get("clipSeconds"), 25))));
    const scheduledAt = parseScheduledAt(formData.get("scheduledAt"));
    const sourceFile = formData.get("sourceFile");

    if (!(sourceFile instanceof File) || sourceFile.size <= 0) {
      return NextResponse.json({ error: "Загрузи файл фильма" }, { status: 400 });
    }

    const [account, template] = await Promise.all([
      prisma.factoryAccount.findUnique({ where: { id: accountId } }),
      prisma.factoryTemplate.findUnique({ where: { id: templateId }, include: { asset: true } }),
    ]);

    if (!account || account.platform !== "YOUTUBE") {
      return NextResponse.json({ error: "YouTube-аккаунт не найден" }, { status: 400 });
    }

    if (!template || !template.asset) {
      return NextResponse.json({ error: "Шаблон Амелии не найден или в нём нет видео" }, { status: 400 });
    }

    const jobSeed = crypto.randomUUID();
    const savedSource = await saveUploadedMovie({ file: sourceFile, jobSeed });

    const job = await prisma.factoryJob.create({
      data: {
        sourceFilePath: savedSource.localPath,
        sourceStorageKey: savedSource.storageKey,
        sourceOriginalName: movieTitle.trim(),
        sourceSizeBytes: savedSource.sizeBytes,
        clipSeconds,
        clipStartIndex: 0,
        titlePrefix: encodeMovieMomentsPrefix(movieTitle),
        game: "OTHER",
        templateId,
        platforms: ["YOUTUBE"],
        publishTiming: scheduledAt ? "USA_SMART" : "NOW",
        scheduledAt,
        cutMode: "SMART_LITE",
        smartStepSeconds: Math.max(5, Math.min(20, Math.round(clipSeconds / 2))),
        smartCandidates: 120,
        smartMinGapSeconds: Math.max(20, clipSeconds + 8),
        hookPreviewSeconds: 0,
        renderFormat: "SHORTS_9_16",
        longVideoTitle: movieTitle.trim(),
        longVideoDescription: description.trim(),
        progress: 0,
        progressLabel: scheduledAt
          ? `Movie Moments создан. Запланировано: ${scheduledAt.toLocaleString("ru-RU")}`
          : "Movie Moments создан. Worker выберет лучшие сцены.",
        targets: {
          create: {
            accountId,
            platform: "YOUTUBE",
            templateId,
            titlePrefix: encodeMovieMomentsPrefix(movieTitle),
            maxClips: clipCount,
          },
        },
      },
      include: { targets: true },
    });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Некорректные данные" }, { status: 400 });
    }

    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось создать Movie Moments" },
      { status: 500 },
    );
  }
}
