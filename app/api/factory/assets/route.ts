import path from "node:path";
import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  FACTORY_HOOKS_DIR,
  FACTORY_LANA_DIR,
  ensureFactoryDirs,
} from "@/lib/factory/paths";
import { extFromName, safeFileName } from "@/lib/factory/video";

export const runtime = "nodejs";

const assetTypeSchema = z.enum(["HOOK", "LANA"]);

export async function GET() {
  const assets = await prisma.factoryAsset.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json({
    assets,
  });
}

export async function POST(request: Request) {
  try {
    await ensureFactoryDirs();

    const formData = await request.formData();

    const type = assetTypeSchema.parse(formData.get("type"));
    const title = z.string().min(1).parse(formData.get("title"));
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Файл не найден",
        },
        {
          status: 400,
        },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = extFromName(file.name);
    const fileName = `${Date.now()}-${safeFileName(title)}${ext}`;

    const targetDir = type === "HOOK" ? FACTORY_HOOKS_DIR : FACTORY_LANA_DIR;
    const filePath = path.join(targetDir, fileName);

    await writeFile(filePath, buffer);

    const asset = await prisma.factoryAsset.create({
      data: {
        type,
        title,
        filePath,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: buffer.byteLength,
      },
    });

    return NextResponse.json({
      asset,
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
        error: error instanceof Error ? error.message : "Не получилось загрузить файл",
      },
      {
        status: 500,
      },
    );
  }
}
