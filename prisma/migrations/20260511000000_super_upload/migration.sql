ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "superUploadPackageId" TEXT;

CREATE INDEX IF NOT EXISTS "FactoryJob_superUploadPackageId_idx"
ON "FactoryJob"("superUploadPackageId");

CREATE TABLE IF NOT EXISTS "FactorySourceVideo" (
  "id" TEXT NOT NULL,
  "sourceVideoId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "channelId" TEXT,
  "channelTitle" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "durationSeconds" INTEGER,
  "publishedAt" TIMESTAMP(3),
  "views" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "comments" INTEGER NOT NULL DEFAULT 0,
  "viewsPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "likeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourceScore" INTEGER NOT NULL DEFAULT 0,
  "viralChance" INTEGER NOT NULL DEFAULT 0,
  "suggestedClips" INTEGER NOT NULL DEFAULT 5,
  "suggestedHookMode" TEXT NOT NULL DEFAULT 'AUTO_BEST_MIX',
  "suggestedWindow" TEXT NOT NULL DEFAULT 'ANALYTICS_BEST_WINDOW',
  "isUsed" BOOLEAN NOT NULL DEFAULT false,
  "usedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactorySourceVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactorySourceVideo_sourceVideoId_key"
ON "FactorySourceVideo"("sourceVideoId");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_channelId_idx"
ON "FactorySourceVideo"("channelId");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_sourceScore_idx"
ON "FactorySourceVideo"("sourceScore");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_viralChance_idx"
ON "FactorySourceVideo"("viralChance");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_isUsed_idx"
ON "FactorySourceVideo"("isUsed");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_publishedAt_idx"
ON "FactorySourceVideo"("publishedAt");

CREATE TABLE IF NOT EXISTS "FactorySuperUploadPackage" (
  "id" TEXT NOT NULL,
  "sourceVideoId" TEXT NOT NULL,
  "accountId" TEXT,
  "accountName" TEXT,
  "game" "FactoryGame" NOT NULL DEFAULT 'ROBLOX',
  "clipsCount" INTEGER NOT NULL,
  "clipSeconds" INTEGER NOT NULL,
  "intervalMin" INTEGER NOT NULL DEFAULT 20,
  "intervalMax" INTEGER NOT NULL DEFAULT 30,
  "scheduleMode" TEXT NOT NULL DEFAULT 'ANALYTICS_BEST_WINDOW',
  "hookMode" TEXT NOT NULL DEFAULT 'AUTO_BEST_MIX',
  "titlePrefix" TEXT NOT NULL DEFAULT 'auto mix',
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "recommendation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactorySuperUploadPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FactorySuperUploadPackage_sourceVideoId_idx"
ON "FactorySuperUploadPackage"("sourceVideoId");

CREATE INDEX IF NOT EXISTS "FactorySuperUploadPackage_accountId_idx"
ON "FactorySuperUploadPackage"("accountId");

CREATE INDEX IF NOT EXISTS "FactorySuperUploadPackage_status_idx"
ON "FactorySuperUploadPackage"("status");

CREATE INDEX IF NOT EXISTS "FactorySuperUploadPackage_createdAt_idx"
ON "FactorySuperUploadPackage"("createdAt");

DO $$ BEGIN
  ALTER TABLE "FactorySuperUploadPackage"
  ADD CONSTRAINT "FactorySuperUploadPackage_sourceVideoId_fkey"
  FOREIGN KEY ("sourceVideoId") REFERENCES "FactorySourceVideo"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryJob"
  ADD CONSTRAINT "FactoryJob_superUploadPackageId_fkey"
  FOREIGN KEY ("superUploadPackageId") REFERENCES "FactorySuperUploadPackage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
