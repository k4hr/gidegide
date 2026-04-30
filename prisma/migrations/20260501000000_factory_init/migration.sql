-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FactoryPlatform" AS ENUM ('YOUTUBE', 'TIKTOK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FactoryJobStatus" AS ENUM ('QUEUED', 'DOWNLOADING', 'RENDERING', 'PUBLISHING', 'DONE', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FactoryPublishStatus" AS ENUM ('QUEUED', 'UPLOADING', 'PUBLISHED', 'FAILED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FactoryAsset" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FactoryAccount" (
  "id" TEXT NOT NULL,
  "platform" "FactoryPlatform" NOT NULL,
  "name" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FactoryJob" (
  "id" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "clipSeconds" INTEGER NOT NULL DEFAULT 45,
  "titlePrefix" TEXT NOT NULL DEFAULT 'Lana watches games',
  "platforms" "FactoryPlatform"[],
  "status" "FactoryJobStatus" NOT NULL DEFAULT 'QUEUED',
  "error" TEXT,
  "totalClips" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FactoryClip" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  "startSec" INTEGER NOT NULL,
  "endSec" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "filePath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FactoryPublish" (
  "id" TEXT NOT NULL,
  "clipId" TEXT NOT NULL,
  "platform" "FactoryPlatform" NOT NULL,
  "status" "FactoryPublishStatus" NOT NULL DEFAULT 'QUEUED',
  "platformPostId" TEXT,
  "platformUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryPublish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryAsset_createdAt_idx" ON "FactoryAsset"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryAccount_platform_idx" ON "FactoryAccount"("platform");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FactoryAccount_platform_name_key" ON "FactoryAccount"("platform", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryJob_status_idx" ON "FactoryJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryJob_createdAt_idx" ON "FactoryJob"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryClip_jobId_idx" ON "FactoryClip"("jobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryClip_createdAt_idx" ON "FactoryClip"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryPublish_clipId_idx" ON "FactoryPublish"("clipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryPublish_platform_idx" ON "FactoryPublish"("platform");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FactoryPublish_status_idx" ON "FactoryPublish"("status");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FactoryClip"
  ADD CONSTRAINT "FactoryClip_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FactoryJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "FactoryPublish"
  ADD CONSTRAINT "FactoryPublish_clipId_fkey"
  FOREIGN KEY ("clipId") REFERENCES "FactoryClip"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
