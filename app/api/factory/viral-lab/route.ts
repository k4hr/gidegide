import { NextResponse } from "next/server";
import path from "node:path";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";
import {
  analyzeViralReference,
  createViralThumbnail,
  ensureViralLabDirs,
  getVideoDurationSec,
  getViralBrainContext,
  rebuildViralBrainSnapshot,
  saveUploadedViralFile,
  VIRAL_REFERENCE_DIR,
} from "@/lib/factory/viral-lab";
import { downloadViaRipYoutube, isYoutubeUrl } from "@/lib/factory/rip-downloader";
import { FACTORY_TEMP_DIR } from "@/lib/factory/paths";
import { runCommand, safeFileName } from "@/lib/factory/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}


async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function saveZipReferences(input: { file: File; analyzeNow: boolean }) {
  const tempDir = path.join(FACTORY_TEMP_DIR, `viral-zip-${Date.now()}-${nanoid(6)}`);
  await mkdir(tempDir, { recursive: true });
  const zipPath = path.join(tempDir, safeFileName(input.file.name) || "references.zip");
  await writeFile(zipPath, Buffer.from(await input.file.arrayBuffer()));
  const extractDir = path.join(tempDir, "extract");
  await mkdir(extractDir, { recursive: true });
  await runCommand("unzip", ["-qq", zipPath, "-d", extractDir]);

  const extracted = (await walkFiles(extractDir)).filter((filePath) => VIDEO_EXTENSIONS.has(extensionOf(filePath)));
  const created = [];
  for (const extractedPath of extracted.slice(0, 100)) {
    const originalName = path.basename(extractedPath);
    const ext = extensionOf(originalName) || ".mp4";
    const finalPath = path.join(VIRAL_REFERENCE_DIR, `${Date.now()}-${nanoid(8)}-${safeFileName(path.basename(originalName, ext)) || "viral-reference"}${ext}`);
    await rename(extractedPath, finalPath);
    const durationSec = await getVideoDurationSec(finalPath).catch(() => null);
    const reference = await withDbRetry(() =>
      prisma.viralReference.create({
        data: {
          title: originalName.replace(/\.[^.]+$/, ""),
          sourceType: "ZIP",
          filePath: finalPath,
          originalName,
          mimeType: "video/mp4",
          durationSec,
          niche: "ROBLOX",
          status: "QUEUED",
        },
      }),
    );
    const thumbnailPath = await createViralThumbnail({ referenceId: reference.id, filePath: finalPath }).catch(() => null);
    if (thumbnailPath) {
      await withDbRetry(() => prisma.viralReference.update({ where: { id: reference.id }, data: { thumbnailPath } }));
    }
    if (input.analyzeNow) await analyzeViralReference(reference.id).catch(() => null);
    created.push(reference);
  }
  return created;
}

async function createUrlReference(sourceUrl: string, title?: string | null, analyzeNow = false) {
  if (isYoutubeUrl(sourceUrl)) {
    const draft = await withDbRetry(() =>
      prisma.viralReference.create({
        data: {
          title: title || sourceUrl,
          sourceType: "URL",
          sourceUrl,
          niche: "ROBLOX",
          status: "QUEUED",
        },
      }),
    );

    try {
      const filePath = await downloadViaRipYoutube({
        jobId: `viral-${draft.id}`,
        sourceUrl,
      });
      const durationSec = await getVideoDurationSec(filePath).catch(() => null);
      const thumbnailPath = await createViralThumbnail({ referenceId: draft.id, filePath }).catch(() => null);
      const updated = await withDbRetry(() =>
        prisma.viralReference.update({
          where: { id: draft.id },
          data: {
            filePath,
            durationSec,
            thumbnailPath,
            originalName: `${draft.id}.mp4`,
            mimeType: "video/mp4",
            status: analyzeNow ? "QUEUED" : "UPLOADED",
            errorMessage: null,
          },
        }),
      );
      if (analyzeNow) await analyzeViralReference(draft.id).catch(() => null);
      return updated;
    } catch (error) {
      return withDbRetry(() =>
        prisma.viralReference.update({
          where: { id: draft.id },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message.slice(0, 1500) : "Не удалось скачать ссылку",
          },
        }),
      );
    }
  }

  return withDbRetry(() =>
    prisma.viralReference.create({
      data: {
        title: title || sourceUrl,
        sourceType: "URL",
        sourceUrl,
        niche: "ROBLOX",
        status: "UPLOADED",
        errorMessage: "Для TikTok/Reels лучше загрузи файл: автоматическое скачивание сейчас подключено только для YouTube-ссылок.",
      },
    }),
  );
}

async function listData() {
  const [references, formulas, latestBrain, brain] = await Promise.all([
    withDbRetry(() =>
      prisma.viralReference.findMany({
        orderBy: { createdAt: "desc" },
        take: 120,
        include: { analysis: true },
      }),
    ),
    withDbRetry(() =>
      prisma.viralFormula.findMany({
        where: { niche: "ROBLOX", status: "ACTIVE" },
        orderBy: [{ confidenceScore: "desc" }, { sourceCount: "desc" }],
        take: 80,
      }),
    ),
    withDbRetry(() =>
      prisma.viralBrainSnapshot.findFirst({ where: { niche: "ROBLOX" }, orderBy: { createdAt: "desc" } }),
    ),
    getViralBrainContext("ROBLOX"),
  ]);

  return {
    references: references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      sourceType: reference.sourceType,
      sourceUrl: reference.sourceUrl,
      originalName: reference.originalName,
      durationSec: reference.durationSec,
      status: reference.status,
      errorMessage: reference.errorMessage,
      analyzedAt: reference.analyzedAt,
      createdAt: reference.createdAt,
      analysis: reference.analysis
        ? {
            hookType: reference.analysis.hookType,
            hookLengthSec: reference.analysis.hookLengthSec,
            storyType: reference.analysis.storyType,
            pacingStyle: reference.analysis.pacingStyle,
            musicMood: reference.analysis.musicMood,
            endingLogic: reference.analysis.endingLogic,
            titlePattern: reference.analysis.titlePattern,
            viralScore: reference.analysis.viralScore,
            extractedFormula: reference.analysis.extractedFormula,
          }
        : null,
    })),
    formulas: formulas.map((formula) => ({
      id: formula.id,
      name: formula.name,
      hookType: formula.hookType,
      storyType: formula.storyType,
      musicMood: formula.musicMood,
      titlePattern: formula.titlePattern,
      endingLogic: formula.endingLogic,
      confidenceScore: formula.confidenceScore,
      sourceCount: formula.sourceCount,
      notes: formula.notes,
      updatedAt: formula.updatedAt,
    })),
    latestBrain: latestBrain
      ? {
          id: latestBrain.id,
          referencesCount: latestBrain.referencesCount,
          formulasCount: latestBrain.formulasCount,
          topHookTypes: latestBrain.topHookTypes,
          topStoryTypes: latestBrain.topStoryTypes,
          topMusicMoods: latestBrain.topMusicMoods,
          titlePatterns: latestBrain.titlePatterns,
          promptContext: latestBrain.promptContext,
          createdAt: latestBrain.createdAt,
        }
      : null,
    brainReady: brain.formulas.length > 0,
  };
}

export async function GET() {
  return NextResponse.json(await listData());
}

export async function POST(request: Request) {
  try {
    await ensureViralLabDirs();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { urls?: string[]; analyzeNow?: boolean };
      const urls = (body.urls ?? []).map((url) => String(url).trim()).filter(Boolean);
      const analyzeNow = Boolean(body.analyzeNow);
      if (urls.length === 0) {
        return NextResponse.json({ error: "Добавь хотя бы одну ссылку" }, { status: 400 });
      }

      const created = [];
      for (const url of urls.slice(0, 100)) {
        created.push(await createUrlReference(url, null, analyzeNow));
      }

      return NextResponse.json({ created, data: await listData(), message: `Ссылки обработаны: ${created.length}. YouTube ссылки система пытается скачать через RIP, TikTok/Reels сохраняются как источник для ручной загрузки.` });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    const analyzeNow = String(formData.get("analyzeNow") ?? "false") === "true";

    if (files.length === 0) {
      return NextResponse.json({ error: "Загрузи mp4/mov/webm файлы" }, { status: 400 });
    }

    const created = [];
    const skipped: string[] = [];

    for (const file of files.slice(0, 100)) {
      const ext = extensionOf(file.name);
      if (ext === ".zip") {
        const zipReferences = await saveZipReferences({ file, analyzeNow });
        created.push(...zipReferences);
        continue;
      }
      if (!VIDEO_EXTENSIONS.has(ext)) {
        skipped.push(file.name);
        continue;
      }

      const reference = await saveUploadedViralFile({ file });
      created.push(reference);

      if (analyzeNow) {
        await analyzeViralReference(reference.id).catch(() => null);
      }
    }

    if (created.length > 0 && analyzeNow) {
      await rebuildViralBrainSnapshot("ROBLOX").catch(() => null);
    }

    return NextResponse.json({
      created,
      skipped,
      data: await listData(),
      message: `Загружено референсов: ${created.length}${skipped.length ? `, пропущено: ${skipped.length}` : ""}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Ошибка Viral Lab" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });
    await withDbRetry(() => prisma.viralReference.delete({ where: { id: body.id } }));
    await rebuildViralBrainSnapshot("ROBLOX").catch(() => null);
    return NextResponse.json({ message: "Референс удален", data: await listData() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Не получилось удалить" }, { status: 500 });
  }
}
