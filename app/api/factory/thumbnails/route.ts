import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../lib/prisma";
import { FACTORY_THUMBNAILS_DIR, ensureFactoryDirs } from "../../../../lib/factory/paths";
import { getR2Prefix, uploadBufferToR2 } from "../../../../lib/factory/r2";
import { extFromName, safeFileName } from "../../../../lib/factory/video";
import { withDbRetry } from "../../../../lib/factory/db-retry";

export const runtime = "nodejs";

const gameSchema = z.enum([
  "ROBLOX",
  "FORTNITE",
  "MINECRAFT",
  "BRAWL_STARS",
  "DOTA2",
  "OTHER",
]);

function isAllowedImage(file: File) {
  const mimeType = file.type.toLowerCase();
  const ext = extFromName(file.name);

  return (
    mimeType.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp"].includes(ext)
  );
}

function getBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function padIndex(index: number) {
  return String(index).padStart(2, "0");
}

async function createThumbnail(input: {
  file: File;
  title: string;
  game: z.infer<typeof gameSchema>;
  index: number;
  total: number;
}) {
  if (!isAllowedImage(input.file)) {
    throw new Error(
      `Файл "${input.file.name}" не подходит. Нужен JPG, PNG или WEBP.`,
    );
  }

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const ext = extFromName(input.file.name) || ".jpg";

  const cleanBaseTitle =
    input.title.trim() ||
    getBaseName(input.file.name) ||
    `${input.game.toLowerCase()} thumbnail`;

  const finalTitle =
    input.total > 1
      ? `${cleanBaseTitle} ${padIndex(input.index + 1)}`
      : cleanBaseTitle;

  const fileName = `${Date.now()}-${input.index}-${safeFileName(
    finalTitle,
  )}${ext}`;

  const filePath = path.join(FACTORY_THUMBNAILS_DIR, fileName);

  const storageKey = `${getR2Prefix()}/thumbnails/${input.game.toLowerCase()}/${fileName}`;

  await writeFile(filePath, buffer);

  const uploadedKey = await uploadBufferToR2({
    key: storageKey,
    buffer,
    contentType: input.file.type || "image/jpeg",
  });

  return withDbRetry(() =>
    prisma.factoryThumbnail.create({
      data: {
        title: finalTitle.slice(0, 80),
        game: input.game,
        filePath,
        storageKey: uploadedKey,
        originalName: input.file.name,
        mimeType: input.file.type || "image/jpeg",
        sizeBytes: buffer.byteLength,
        isActive: true,
      },
    }),
  );
}

export async function GET() {
  try {
    const thumbnails = await withDbRetry(() =>
      prisma.factoryThumbnail.findMany({
        orderBy: {
          createdAt: "desc",
        },
      }),
    );

    return NextResponse.json({
      thumbnails,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не получилось загрузить превью",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureFactoryDirs();

    const formData = await request.formData();

    const title = z
      .string()
      .max(80)
      .optional()
      .parse(String(formData.get("title") ?? ""));

    const game = gameSchema.parse(formData.get("game") || "OTHER");

    const filesFromMultipleInput = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    const singleFile = formData.get("file");

    const files =
      filesFromMultipleInput.length > 0
        ? filesFromMultipleInput
        : singleFile instanceof File
          ? [singleFile]
          : [];

    if (files.length === 0) {
      return NextResponse.json(
        {
          error: "Файлы превью не найдены",
        },
        {
          status: 400,
        },
      );
    }

    if (files.length > 80) {
      return NextResponse.json(
        {
          error: "За один раз можно загрузить максимум 80 превью",
        },
        {
          status: 400,
        },
      );
    }

    const invalidFile = files.find((file) => !isAllowedImage(file));

    if (invalidFile) {
      return NextResponse.json(
        {
          error: `Файл "${invalidFile.name}" не подходит. Загрузи JPG, PNG или WEBP.`,
        },
        {
          status: 400,
        },
      );
    }

    const thumbnails = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      const thumbnail = await createThumbnail({
        file,
        title: title || getBaseName(file.name),
        game,
        index,
        total: files.length,
      });

      thumbnails.push(thumbnail);
    }

    return NextResponse.json({
      thumbnail: thumbnails[0] ?? null,
      thumbnails,
      uploadedCount: thumbnails.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: error.issues[0]?.message ?? "Некорректные данные",
        },
        {
          status: 400,
        },
      );
    }

    console.error(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Не получилось загрузить превью",
      },
      {
        status: 500,
      },
    );
  }
}
