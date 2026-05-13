-- Separate donor/source pools for Amelia Super Upload and Roblox Story Shorts.
-- Existing rows remain in SUPER_UPLOAD so old packages keep working.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FactoryDonorKind') THEN
    CREATE TYPE "FactoryDonorKind" AS ENUM ('SUPER_UPLOAD', 'STORY_SHORTS');
  END IF;
END $$;

ALTER TABLE "FactoryDonorChannel"
  ADD COLUMN IF NOT EXISTS "donorKind" "FactoryDonorKind" NOT NULL DEFAULT 'SUPER_UPLOAD';

ALTER TABLE "FactorySourceVideo"
  ADD COLUMN IF NOT EXISTS "sourceKind" "FactoryDonorKind" NOT NULL DEFAULT 'SUPER_UPLOAD';

DROP INDEX IF EXISTS "FactoryDonorChannel_channelId_key";
DROP INDEX IF EXISTS "FactorySourceVideo_sourceVideoId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryDonorChannel_channelId_donorKind_key"
  ON "FactoryDonorChannel"("channelId", "donorKind");

CREATE INDEX IF NOT EXISTS "FactoryDonorChannel_donorKind_idx"
  ON "FactoryDonorChannel"("donorKind");

CREATE UNIQUE INDEX IF NOT EXISTS "FactorySourceVideo_sourceVideoId_sourceKind_key"
  ON "FactorySourceVideo"("sourceVideoId", "sourceKind");

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_sourceKind_idx"
  ON "FactorySourceVideo"("sourceKind");
