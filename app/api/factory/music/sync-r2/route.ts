import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "../../../../../lib/prisma";
import { getR2Prefix, listR2Objects } from "../../../../../lib/factory/r2";
import { withDbRetry } from "../../../../../lib/factory/db-retry";
import {
  COPYRIGHT_STATUSES,
  MUSIC_LICENSE_TYPES,
  MUSIC_SOURCES,
  riskScoreForMusicCopyrightStatus,
} from "../../../../../lib/factory/music-library";

export const runtime = "nodejs";

const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".mp4",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
};

const bodySchema = z.object({
  prefix: z.string().trim().optional(),
  musicSource: z.enum(MUSIC_SOURCES).default("YOUTUBE_AUDIO_LIBRARY"),
  licenseType: z.enum(MUSIC_LICENSE_TYPES).default("ATTRIBUTION_NOT_REQUIRED"),
  copyrightStatus: z.enum(COPYRIGHT_STATUSES).default("SAFE_YOUTUBE_AUDIO_LIBRARY"),
  needsAttribution: z.boolean().default(false),
  attributionText: z.string().trim().max(1000).nullable().optional(),
});

function normalizeFolderName(value: string) {
  return decodeURIComponent(value)
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function moodFromFolder(folderName: string) {
  const folder = normalizeFolderName(folderName);

  if (folder.includes("celebration")) return "victory";
  if (folder.includes("chase") || folder.includes("fight")) return "chase";
  if (folder.includes("chill")) return "chill";
  if (folder.includes("dramatic")) return "dramatic";
  if (folder.includes("dumb")) return "funny";
  if (folder.includes("explaining")) return "explaining";
  if (folder.includes("finale")) return "finale";
  if (folder.includes("funny")) return "funny";
  if (folder.includes("happy")) return "happy";
  if (folder.includes("hype")) return "hype";
  if (folder.includes("intense")) return "intense";
  if (folder.includes("random")) return "random";
  if (folder.includes("riser")) return "riser";
  if (folder.includes("sad")) return "sad";
  if (folder.includes("scary")) return "scary";
  if (folder.includes("sneaky")) return "sneaky";
  if (folder.includes("other")) return "other";

  return "other";
}

function titleFromKey(key: string) {
  const baseName = path.basename(key).replace(/\.[^.]+$/, "");

  return baseName
    .replace(/^\d+[-_ ]+/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140) || "music track";
}

function folderFromKey(prefix: string, key: string) {
  const relative = key.slice(prefix.length).replace(/^\/+/, "");
  const parts = relative.split("/").filter(Boolean);

  return parts.length > 1 ? parts[0] : "Other";
}

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const rootPrefix = String(body.prefix ?? `${getR2Prefix()}/music-library/`)
      .replace(/^\/+/, "")
      .replace(/\/+$/, "") + "/";

    const objects = await listR2Objects({ prefix: rootPrefix });
    let found = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ key: string; error: string }> = [];

    for (const object of objects) {
      const ext = path.extname(object.key).toLowerCase();

      if (!AUDIO_EXTENSIONS.has(ext)) {
        skipped += 1;
        continue;
      }

      found += 1;

      try {
        const folder = folderFromKey(rootPrefix, object.key);
        const mood = moodFromFolder(folder);
        const originalName = path.basename(object.key);

        const existing = await withDbRetry(() =>
          prisma.factoryMusicTrack.findFirst({
            where: { storageKey: object.key },
            select: { id: true, copyrightStatus: true, musicSource: true, licenseType: true },
          }),
        );

        if (existing) {
          // Keep blocked/risky decisions, but allow sync to enrich old UNKNOWN tracks as safe.
          if (existing.copyrightStatus === "UNKNOWN") {
            await withDbRetry(() =>
              prisma.factoryMusicTrack.update({
                where: { id: existing.id },
                data: {
                  musicSource: body.musicSource,
                  licenseType: body.licenseType,
                  copyrightStatus: body.copyrightStatus,
                  needsAttribution: body.needsAttribution,
                  attributionText: body.attributionText ?? null,
                  riskScore: riskScoreForMusicCopyrightStatus(body.copyrightStatus),
                  confirmedSafeAt: body.copyrightStatus.startsWith("SAFE_") ? new Date() : null,
                },
              }),
            );
            updated += 1;
          } else {
            skipped += 1;
          }
          continue;
        }

        await withDbRetry(() =>
          prisma.factoryMusicTrack.create({
            data: {
              title: titleFromKey(object.key),
              mood,
              filePath: `r2://${object.key}`,
              storageKey: object.key,
              originalName,
              mimeType: MIME_BY_EXT[ext] ?? "audio/mpeg",
              sizeBytes: object.size ?? null,
              isActive: body.copyrightStatus !== "BLOCKED",
              copyrightStatus: body.copyrightStatus,
              musicSource: body.musicSource,
              licenseType: body.licenseType,
              needsAttribution: body.needsAttribution,
              attributionText: body.attributionText ?? null,
              riskScore: riskScoreForMusicCopyrightStatus(body.copyrightStatus),
              confirmedSafeAt: body.copyrightStatus.startsWith("SAFE_") ? new Date() : null,
            },
          }),
        );

        created += 1;
      } catch (error) {
        errors.push({
          key: object.key,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      prefix: rootPrefix,
      scanned: objects.length,
      found,
      created,
      updated,
      skipped,
      errors,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не получилось синхронизировать R2-библиотеку" },
      { status: 500 },
    );
  }
}
