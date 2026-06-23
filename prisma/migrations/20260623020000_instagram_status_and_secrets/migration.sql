-- Instagram cooldown / source accounting
ALTER TABLE "FactoryInstagramAutoSource" ADD COLUMN IF NOT EXISTS "lastScanAt" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSource" ADD COLUMN IF NOT EXISTS "cooldownUntil" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSource" ADD COLUMN IF NOT EXISTS "lastFoundCount" INTEGER;
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSource_cooldownUntil_idx" ON "FactoryInstagramAutoSource"("cooldownUntil");

-- Instagram reel lifecycle timestamps
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "sourcePublishedAt" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "renderedAt" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "publishedAtChannel" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD COLUMN IF NOT EXISTS "failReason" TEXT;
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_seenAt_idx" ON "FactoryInstagramAutoSourceVideo"("seenAt");
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_queuedAt_idx" ON "FactoryInstagramAutoSourceVideo"("queuedAt");
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_downloadedAt_idx" ON "FactoryInstagramAutoSourceVideo"("downloadedAt");
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_renderedAt_idx" ON "FactoryInstagramAutoSourceVideo"("renderedAt");
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_publishedAtChannel_idx" ON "FactoryInstagramAutoSourceVideo"("publishedAtChannel");
CREATE INDEX IF NOT EXISTS "FactoryInstagramAutoSourceVideo_failedAt_idx" ON "FactoryInstagramAutoSourceVideo"("failedAt");

-- Secrets/settings are stored in DB, not in Railway env.
CREATE TABLE IF NOT EXISTS "FactorySecret" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactorySecret_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FactorySecret_key_key" ON "FactorySecret"("key");
CREATE INDEX IF NOT EXISTS "FactorySecret_key_idx" ON "FactorySecret"("key");

CREATE TABLE IF NOT EXISTS "FactorySetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactorySetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FactorySetting_key_key" ON "FactorySetting"("key");
CREATE INDEX IF NOT EXISTS "FactorySetting_key_idx" ON "FactorySetting"("key");
