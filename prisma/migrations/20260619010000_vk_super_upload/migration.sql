CREATE TABLE IF NOT EXISTS "FactoryVkGroup" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "category" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactoryVkGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryVkGroup_url_key" ON "FactoryVkGroup"("url");
CREATE INDEX IF NOT EXISTS "FactoryVkGroup_isActive_idx" ON "FactoryVkGroup"("isActive");
CREATE INDEX IF NOT EXISTS "FactoryVkGroup_lastCheckedAt_idx" ON "FactoryVkGroup"("lastCheckedAt");
CREATE INDEX IF NOT EXISTS "FactoryVkGroup_createdAt_idx" ON "FactoryVkGroup"("createdAt");

CREATE TABLE IF NOT EXISTS "FactoryVkVideoCandidate" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "sourceVideoId" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "thumbnailUrl" TEXT,
  "durationSeconds" INTEGER,
  "score" INTEGER NOT NULL DEFAULT 50,
  "isUsed" BOOLEAN NOT NULL DEFAULT false,
  "usedAt" TIMESTAMP(3),
  "createdJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactoryVkVideoCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_sourceVideoId_key" ON "FactoryVkVideoCandidate"("sourceVideoId");
CREATE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_groupId_idx" ON "FactoryVkVideoCandidate"("groupId");
CREATE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_score_idx" ON "FactoryVkVideoCandidate"("score");
CREATE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_isUsed_idx" ON "FactoryVkVideoCandidate"("isUsed");
CREATE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_createdAt_idx" ON "FactoryVkVideoCandidate"("createdAt");
CREATE INDEX IF NOT EXISTS "FactoryVkVideoCandidate_createdJobId_idx" ON "FactoryVkVideoCandidate"("createdJobId");

DO $$ BEGIN
  ALTER TABLE "FactoryVkVideoCandidate"
  ADD CONSTRAINT "FactoryVkVideoCandidate_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "FactoryVkGroup"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryVkVideoCandidate"
  ADD CONSTRAINT "FactoryVkVideoCandidate_createdJobId_fkey"
  FOREIGN KEY ("createdJobId") REFERENCES "FactoryJob"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
