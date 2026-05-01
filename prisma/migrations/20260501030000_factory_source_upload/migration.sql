ALTER TABLE "FactoryJob"
ALTER COLUMN "sourceUrl" DROP NOT NULL;

ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "sourceFilePath" TEXT,
ADD COLUMN IF NOT EXISTS "sourceStorageKey" TEXT,
ADD COLUMN IF NOT EXISTS "sourceOriginalName" TEXT,
ADD COLUMN IF NOT EXISTS "sourceSizeBytes" INTEGER;

CREATE INDEX IF NOT EXISTS "FactoryJob_sourceStorageKey_idx" ON "FactoryJob"("sourceStorageKey");
