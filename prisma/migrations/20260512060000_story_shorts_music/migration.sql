ALTER TYPE "FactoryCutMode" ADD VALUE IF NOT EXISTS 'ROBLOX_STORY_AI';

CREATE TABLE IF NOT EXISTS "FactoryMusicTrack" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "mood" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "storageKey" TEXT,
  "originalName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactoryMusicTrack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FactoryMusicTrack_mood_idx" ON "FactoryMusicTrack"("mood");
CREATE INDEX IF NOT EXISTS "FactoryMusicTrack_isActive_idx" ON "FactoryMusicTrack"("isActive");
CREATE INDEX IF NOT EXISTS "FactoryMusicTrack_createdAt_idx" ON "FactoryMusicTrack"("createdAt");
CREATE INDEX IF NOT EXISTS "FactoryMusicTrack_storageKey_idx" ON "FactoryMusicTrack"("storageKey");

ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storyStyle" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storyMinSeconds" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storyMaxSeconds" INTEGER NOT NULL DEFAULT 35;
ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storyMusicMood" TEXT NOT NULL DEFAULT 'AUTO';
ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storySourceVolume" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "storyUseEmojis" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "FactoryJob_storyStyle_idx" ON "FactoryJob"("storyStyle");
