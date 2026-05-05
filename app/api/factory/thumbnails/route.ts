import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { FACTORY_THUMBNAILS_DIR, ensureFactoryDirs } from "@/lib/factory/paths";
import { getR2Prefix, uploadBufferToR2 } from "@/lib/factory/r2";
import { extFromName, safeFileName } from "@/lib/factory/video";
import { withDbRetry } from "@/lib/factory/db-retry";

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
    const title = z.string().min(1).max(80).parse(formData.get("title"));
    const game = gameSchema.parse(formData.get("game") || "OTHER");
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Файл превью не найден",
        },
        {
          status: 400,
        },
      );
    }

    if (!isAllowedImage(file)) {
      return NextResponse.json(
        {
          error: "Загрузи JPG, PNG или WEBP картинку",
        },
        {
          status: 400,
        },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromName(file.name);
    const fileName = `${Date.now()}-${safeFileName(title)}${ext}`;
    const filePath = path.join(FACTORY_THUMBNAILS_DIR, fileName);
    const storageKey = `${getR2Prefix()}/thumbnails/${game.toLowerCase()}/${fileName}`;

    await writeFile(filePath, buffer);

    const uploadedKey = await uploadBufferToR2({
      key: storageKey,
      buffer,
      contentType: file.type || "image/jpeg",
    });

    const thumbnail = await withDbRetry(() =>
      prisma.factoryThumbnail.create({
        data: {
          title,
          game,
          filePath,
          storageKey: uploadedKey,
          originalName: file.name,
          mimeType: file.type || "image/jpeg",
          sizeBytes: buffer.byteLength,
          isActive: true,
        },
      }),
    );

    return NextResponse.json({
      thumbnail,
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
