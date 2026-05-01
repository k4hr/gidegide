ALTER TYPE "FactoryJobStatus" ADD VALUE IF NOT EXISTS 'CANCELED';
ALTER TYPE "FactoryPublishStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

ALTER TABLE "FactoryAsset"
ADD COLUMN IF NOT EXISTS "storageKey" TEXT;

ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "progressLabel" TEXT,
ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "canceledAt" TIMESTAMP(3);

ALTER TABLE "FactoryClip"
ADD COLUMN IF NOT EXISTS "storageKey" TEXT;

CREATE INDEX IF NOT EXISTS "FactoryAsset_storageKey_idx" ON "FactoryAsset"("storageKey");
CREATE INDEX IF NOT EXISTS "FactoryJob_cancelRequested_idx" ON "FactoryJob"("cancelRequested");
CREATE INDEX IF NOT EXISTS "FactoryClip_storageKey_idx" ON "FactoryClip"("storageKey");
