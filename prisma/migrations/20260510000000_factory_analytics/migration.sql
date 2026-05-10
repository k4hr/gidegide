-- Add analytics fields to FactoryAccount
ALTER TABLE "FactoryAccount"
  ADD COLUMN IF NOT EXISTS "platformChannelId" TEXT;

CREATE INDEX IF NOT EXISTS "FactoryAccount_platformChannelId_idx"
  ON "FactoryAccount"("platformChannelId");

-- Add analytics fields to FactoryPublish
ALTER TABLE "FactoryPublish"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "FactoryPublish_platformPostId_idx"
  ON "FactoryPublish"("platformPostId");

CREATE INDEX IF NOT EXISTS "FactoryPublish_publishedAt_idx"
  ON "FactoryPublish"("publishedAt");

-- Create FactoryVideoMetric
CREATE TABLE IF NOT EXISTS "FactoryVideoMetric" (
  "id" TEXT NOT NULL,
  "publishId" TEXT NOT NULL,
  "clipId" TEXT NOT NULL,
  "accountId" TEXT,
  "platform" "FactoryPlatform" NOT NULL,
  "platformVideoId" TEXT NOT NULL,

  "views" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "comments" INTEGER NOT NULL DEFAULT 0,
  "shares" INTEGER NOT NULL DEFAULT 0,

  "estimatedMinutesWatched" INTEGER NOT NULL DEFAULT 0,
  "averageViewDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageViewPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subscribersGained" INTEGER NOT NULL DEFAULT 0,
  "subscribersLost" INTEGER NOT NULL DEFAULT 0,

  "ageMinutes" INTEGER NOT NULL DEFAULT 0,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FactoryVideoMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_publishId_idx"
  ON "FactoryVideoMetric"("publishId");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_clipId_idx"
  ON "FactoryVideoMetric"("clipId");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_accountId_idx"
  ON "FactoryVideoMetric"("accountId");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_platform_idx"
  ON "FactoryVideoMetric"("platform");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_platformVideoId_idx"
  ON "FactoryVideoMetric"("platformVideoId");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_checkedAt_idx"
  ON "FactoryVideoMetric"("checkedAt");

CREATE INDEX IF NOT EXISTS "FactoryVideoMetric_ageMinutes_idx"
  ON "FactoryVideoMetric"("ageMinutes");

DO $$ BEGIN
  ALTER TABLE "FactoryVideoMetric"
  ADD CONSTRAINT "FactoryVideoMetric_publishId_fkey"
  FOREIGN KEY ("publishId") REFERENCES "FactoryPublish"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryVideoMetric"
  ADD CONSTRAINT "FactoryVideoMetric_clipId_fkey"
  FOREIGN KEY ("clipId") REFERENCES "FactoryClip"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryVideoMetric"
  ADD CONSTRAINT "FactoryVideoMetric_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FactoryAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create FactoryVideoAnalysis
CREATE TABLE IF NOT EXISTS "FactoryVideoAnalysis" (
  "id" TEXT NOT NULL,

  "publishId" TEXT NOT NULL,
  "clipId" TEXT NOT NULL,
  "accountId" TEXT,

  "platform" "FactoryPlatform" NOT NULL,
  "platformVideoId" TEXT NOT NULL,

  "viewsNow" INTEGER NOT NULL DEFAULT 0,
  "views1h" INTEGER NOT NULL DEFAULT 0,
  "views3h" INTEGER NOT NULL DEFAULT 0,
  "views6h" INTEGER NOT NULL DEFAULT 0,
  "views24h" INTEGER NOT NULL DEFAULT 0,
  "views48h" INTEGER NOT NULL DEFAULT 0,

  "likesNow" INTEGER NOT NULL DEFAULT 0,
  "commentsNow" INTEGER NOT NULL DEFAULT 0,
  "sharesNow" INTEGER NOT NULL DEFAULT 0,

  "likes24h" INTEGER NOT NULL DEFAULT 0,
  "comments24h" INTEGER NOT NULL DEFAULT 0,
  "shares24h" INTEGER NOT NULL DEFAULT 0,
  "subscribersGained24h" INTEGER NOT NULL DEFAULT 0,
  "subscribersLost24h" INTEGER NOT NULL DEFAULT 0,

  "estimatedMinutesWatched24h" INTEGER NOT NULL DEFAULT 0,
  "averageViewDuration24h" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "averageViewPercentage24h" DOUBLE PRECISION NOT NULL DEFAULT 0,

  "likeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subscriberRate" DOUBLE PRECISION NOT NULL DEFAULT 0,

  "factoryScore" INTEGER NOT NULL DEFAULT 0,
  "velocityType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "verdict" TEXT NOT NULL DEFAULT 'WAITING',
  "recommendation" TEXT,

  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryVideoAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryVideoAnalysis_publishId_key"
  ON "FactoryVideoAnalysis"("publishId");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_clipId_idx"
  ON "FactoryVideoAnalysis"("clipId");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_accountId_idx"
  ON "FactoryVideoAnalysis"("accountId");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_platform_idx"
  ON "FactoryVideoAnalysis"("platform");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_platformVideoId_idx"
  ON "FactoryVideoAnalysis"("platformVideoId");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_factoryScore_idx"
  ON "FactoryVideoAnalysis"("factoryScore");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_verdict_idx"
  ON "FactoryVideoAnalysis"("verdict");

CREATE INDEX IF NOT EXISTS "FactoryVideoAnalysis_lastCheckedAt_idx"
  ON "FactoryVideoAnalysis"("lastCheckedAt");

DO $$ BEGIN
  ALTER TABLE "FactoryVideoAnalysis"
  ADD CONSTRAINT "FactoryVideoAnalysis_publishId_fkey"
  FOREIGN KEY ("publishId") REFERENCES "FactoryPublish"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryVideoAnalysis"
  ADD CONSTRAINT "FactoryVideoAnalysis_clipId_fkey"
  FOREIGN KEY ("clipId") REFERENCES "FactoryClip"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryVideoAnalysis"
  ADD CONSTRAINT "FactoryVideoAnalysis_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FactoryAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
