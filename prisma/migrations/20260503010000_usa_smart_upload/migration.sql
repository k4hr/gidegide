ALTER TYPE "FactoryPublishTiming" ADD VALUE IF NOT EXISTS 'USA_SMART';

ALTER TABLE "FactoryJob" ADD COLUMN IF NOT EXISTS "clipStartIndex" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "FactoryJob_clipStartIndex_idx" ON "FactoryJob"("clipStartIndex");
