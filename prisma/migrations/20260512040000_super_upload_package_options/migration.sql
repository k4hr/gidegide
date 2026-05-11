ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "hookPreviewSeconds" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "FactorySuperUploadPackage"
ADD COLUMN IF NOT EXISTS "hookPreviewSeconds" INTEGER NOT NULL DEFAULT 8;

CREATE INDEX IF NOT EXISTS "FactoryJob_hookPreviewSeconds_idx" ON "FactoryJob"("hookPreviewSeconds");
