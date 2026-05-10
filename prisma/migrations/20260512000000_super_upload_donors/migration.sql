-- Hot donor channels for Super Upload
CREATE TABLE IF NOT EXISTS "FactoryDonorChannel" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelTitle" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "uploadsPlaylistId" TEXT,
  "subscriberCount" BIGINT NOT NULL DEFAULT 0,
  "videoCount" BIGINT NOT NULL DEFAULT 0,
  "viewCount" BIGINT NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FactoryDonorChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryDonorChannel_channelId_key"
  ON "FactoryDonorChannel"("channelId");

CREATE INDEX IF NOT EXISTS "FactoryDonorChannel_isActive_idx"
  ON "FactoryDonorChannel"("isActive");

CREATE INDEX IF NOT EXISTS "FactoryDonorChannel_lastCheckedAt_idx"
  ON "FactoryDonorChannel"("lastCheckedAt");

CREATE INDEX IF NOT EXISTS "FactoryDonorChannel_createdAt_idx"
  ON "FactoryDonorChannel"("createdAt");

ALTER TABLE "FactorySourceVideo"
  ADD COLUMN IF NOT EXISTS "donorChannelId" TEXT;

CREATE INDEX IF NOT EXISTS "FactorySourceVideo_donorChannelId_idx"
  ON "FactorySourceVideo"("donorChannelId");

DO $$ BEGIN
  ALTER TABLE "FactorySourceVideo"
  ADD CONSTRAINT "FactorySourceVideo_donorChannelId_fkey"
  FOREIGN KEY ("donorChannelId") REFERENCES "FactoryDonorChannel"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
