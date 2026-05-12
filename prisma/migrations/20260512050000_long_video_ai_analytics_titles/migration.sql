DO $$ BEGIN
  CREATE TYPE "FactoryTemplateKind" AS ENUM ('SHORTS_9_16', 'LONG_16_9');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FactoryFacecamPosition" AS ENUM ('TOP_LEFT', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_RIGHT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "FactoryRenderFormat" AS ENUM ('SHORTS_9_16', 'LONG_16_9');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "FactoryTemplate"
  ADD COLUMN IF NOT EXISTS "kind" "FactoryTemplateKind" NOT NULL DEFAULT 'SHORTS_9_16',
  ADD COLUMN IF NOT EXISTS "facecamPosition" "FactoryFacecamPosition" NOT NULL DEFAULT 'TOP_LEFT',
  ADD COLUMN IF NOT EXISTS "facecamWidthPercent" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "facecamMarginPercent" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "facecamBorderRadius" INTEGER NOT NULL DEFAULT 18;

ALTER TABLE "FactoryJob"
  ADD COLUMN IF NOT EXISTS "renderFormat" "FactoryRenderFormat" NOT NULL DEFAULT 'SHORTS_9_16',
  ADD COLUMN IF NOT EXISTS "longVideoTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "longVideoDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "longVideoThumbnailPath" TEXT,
  ADD COLUMN IF NOT EXISTS "longVideoThumbnailStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "longVideoFacecamPosition" "FactoryFacecamPosition",
  ADD COLUMN IF NOT EXISTS "longVideoFacecamWidthPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "longVideoFacecamMarginPercent" INTEGER;

CREATE INDEX IF NOT EXISTS "FactoryTemplate_kind_idx" ON "FactoryTemplate"("kind");
CREATE INDEX IF NOT EXISTS "FactoryJob_renderFormat_idx" ON "FactoryJob"("renderFormat");
