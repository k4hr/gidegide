DO $$ BEGIN
  CREATE TYPE "FactoryGame" AS ENUM ('ROBLOX', 'FORTNITE', 'MINECRAFT', 'BRAWL_STARS', 'DOTA2', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "FactoryTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "lanaX" INTEGER NOT NULL DEFAULT 78,
  "lanaY" INTEGER NOT NULL DEFAULT 68,
  "lanaWidth" INTEGER NOT NULL DEFAULT 300,
  "lanaHeight" INTEGER NOT NULL DEFAULT 533,
  "mirrorLana" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "game" "FactoryGame" NOT NULL DEFAULT 'OTHER',
ADD COLUMN IF NOT EXISTS "templateId" TEXT;

CREATE INDEX IF NOT EXISTS "FactoryTemplate_isDefault_idx" ON "FactoryTemplate"("isDefault");
CREATE INDEX IF NOT EXISTS "FactoryTemplate_createdAt_idx" ON "FactoryTemplate"("createdAt");
CREATE INDEX IF NOT EXISTS "FactoryJob_game_idx" ON "FactoryJob"("game");
CREATE INDEX IF NOT EXISTS "FactoryJob_templateId_idx" ON "FactoryJob"("templateId");

DO $$ BEGIN
  ALTER TABLE "FactoryJob"
  ADD CONSTRAINT "FactoryJob_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "FactoryTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "FactoryTemplate" (
  "id",
  "name",
  "isDefault",
  "lanaX",
  "lanaY",
  "lanaWidth",
  "lanaHeight",
  "mirrorLana",
  "updatedAt"
)
SELECT
  'default-lana-corner',
  'Default — Lana bottom right',
  true,
  78,
  68,
  300,
  533,
  false,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FactoryTemplate" WHERE "isDefault" = true
);
