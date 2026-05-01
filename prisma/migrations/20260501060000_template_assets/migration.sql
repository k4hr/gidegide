ALTER TABLE "FactoryTemplate"
ADD COLUMN IF NOT EXISTS "assetId" TEXT;

CREATE INDEX IF NOT EXISTS "FactoryTemplate_assetId_idx"
ON "FactoryTemplate"("assetId");

DO $$ BEGIN
  ALTER TABLE "FactoryTemplate"
  ADD CONSTRAINT "FactoryTemplate_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "FactoryAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
