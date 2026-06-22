import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";
import {
  FACTORY_SOURCE_DIR,
  FACTORY_THUMBNAILS_DIR,
  ensureFactoryDirs,
} from "../../../../lib/factory/paths";
import { extFromName, safeFileName } from "../../../../lib/factory/video";
import { getR2Prefix, uploadBufferToR2 } from "../../../../lib/factory/r2";

export const runtime = "nodejs";

function parseScheduledAt(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string" || !value.trim()) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Некорректное время публикации");
  }

  return date;
}

async function saveUploadedFile(input: {
  file: File;
  folder: "source" | "thumbnail";
  jobSeed: string;
}) {
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const ext = extFromName(input.file.name);
  const fileName = `${input.jobSeed}-${safeFileName(input.file.name)}${ext}`;
  const localDir = input.folder === "source" ? FACTORY_SOURCE_DIR : FACTORY_THUMBNAILS_DIR;
  const localPath = path.join(localDir, fileName);

  await writeFile(localPath, buffer);

  const storageKey = `${getR2Prefix()}/long-video/${input.jobSeed}/${input.folder}/${fileName}`;
  const uploadedKey = await uploadBufferToR2({
    key: storageKey,
    buffer,
    contentType: input.file.type || (input.folder === "source" ? "video/mp4" : "image/jpeg"),
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
    const sourceUrl = z
      .string()
      .url()
      .optional()
      .nullable()
      .parse(formData.get("sourceUrl") || null);
    const title = z.string().min(1).max(100).parse(formData.get("title"));
    const description = z.string().max(5000).optional().parse(formData.get("description") || "");
    const accountId = z.string().min(1).parse(formData.get("accountId"));
    const templateId = z.string().min(1).parse(formData.get("templateId"));
    const scheduledAt = parseScheduledAt(formData.get("scheduledAt"));
    const sourceFile = formData.get("sourceFile");
    const thumbnailFile = formData.get("thumbnailFile");

    if (!sourceUrl && !(sourceFile instanceof File)) {
      return NextResponse.json(
        { error: "Вставь ссылку на видео или загрузи MP4-файл" },
        { status: 400 },
      );
    }

    const [account, template] = await Promise.all([
      prisma.factoryAccount.findUnique({ where: { id: accountId } }),
      prisma.factoryTemplate.findUnique({ where: { id: templateId }, include: { asset: true } }),
    ]);

    if (!account || account.platform !== "YOUTUBE") {
      return NextResponse.json({ error: "YouTube-аккаунт не найден" }, { status: 400 });
    }

    if (!template || !template.asset) {
      return NextResponse.json({ error: "Шаблон реакции не найден или в нем нет видео" }, { status: 400 });
    }

    const jobSeed = crypto.randomUUID();
    let sourceFilePath: string | null = null;
    let sourceStorageKey: string | null = null;
    let sourceOriginalName: string | null = null;
    let sourceSizeBytes: number | null = null;

    if (sourceFile instanceof File) {
      const savedSource = await saveUploadedFile({
        file: sourceFile,
        folder: "source",
        jobSeed,
      });
      sourceFilePath = savedSource.localPath;
      sourceStorageKey = savedSource.storageKey;
      sourceOriginalName = savedSource.originalName;
      sourceSizeBytes = savedSource.sizeBytes;
    }

    let thumbnailPath: string | null = null;
    let thumbnailStorageKey: string | null = null;

    if (thumbnailFile instanceof File && thumbnailFile.size > 0) {
      const savedThumbnail = await saveUploadedFile({
        file: thumbnailFile,
        folder: "thumbnail",
        jobSeed,
      });
      thumbnailPath = savedThumbnail.localPath;
      thumbnailStorageKey = savedThumbnail.storageKey;
    }

    const job = await prisma.factoryJob.create({
      data: {
        sourceUrl: sourceUrl || null,
        sourceFilePath,
        sourceStorageKey,
        sourceOriginalName,
        sourceSizeBytes,
        clipSeconds: 60,
        clipStartIndex: 0,
        titlePrefix: title,
        game: "ROBLOX",
        templateId,
        platforms: ["YOUTUBE"],
        publishTiming: scheduledAt ? "USA_SMART" : "NOW",
        scheduledAt,
        cutMode: "SEQUENTIAL",
        renderFormat: "LONG_16_9",
        longVideoTitle: title,
        longVideoDescription: description,
        longVideoThumbnailPath: thumbnailPath,
        longVideoThumbnailStorageKey: thumbnailStorageKey,
        progress: 0,
        progressLabel: scheduledAt
          ? `Видео 16:9 создано. Запланировано: ${scheduledAt.toLocaleString("ru-RU")}`
          : "Видео 16:9 создано",
        targets: {
          create: {
            accountId,
            platform: "YOUTUBE",
            templateId,
            titlePrefix: title,
            maxClips: 1,
          },
        },
      },
      include: {
        targets: true,
      },
    });

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Некорректные данные" },
        { status: 400 },
      );
    }

    console.error(error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось создать 16:9 видео" },
      { status: 500 },
    );
  }
}
