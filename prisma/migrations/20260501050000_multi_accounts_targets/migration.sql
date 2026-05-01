CREATE TABLE IF NOT EXISTS "FactoryJobTarget" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "platform" "FactoryPlatform" NOT NULL,
  "templateId" TEXT,
  "titlePrefix" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FactoryJobTarget_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FactoryPublish"
ADD COLUMN IF NOT EXISTS "targetId" TEXT,
ADD COLUMN IF NOT EXISTS "accountId" TEXT,
ADD COLUMN IF NOT EXISTS "renderFilePath" TEXT,
ADD COLUMN IF NOT EXISTS "renderStorageKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "FactoryJobTarget_jobId_accountId_key"
ON "FactoryJobTarget"("jobId", "accountId");

CREATE INDEX IF NOT EXISTS "FactoryJobTarget_jobId_idx"
ON "FactoryJobTarget"("jobId");

CREATE INDEX IF NOT EXISTS "FactoryJobTarget_accountId_idx"
ON "FactoryJobTarget"("accountId");

CREATE INDEX IF NOT EXISTS "FactoryJobTarget_platform_idx"
ON "FactoryJobTarget"("platform");

CREATE INDEX IF NOT EXISTS "FactoryJobTarget_templateId_idx"
ON "FactoryJobTarget"("templateId");

CREATE INDEX IF NOT EXISTS "FactoryPublish_targetId_idx"
ON "FactoryPublish"("targetId");

CREATE INDEX IF NOT EXISTS "FactoryPublish_accountId_idx"
ON "FactoryPublish"("accountId");

DO $$ BEGIN
  ALTER TABLE "FactoryJobTarget"
  ADD CONSTRAINT "FactoryJobTarget_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "FactoryJob"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryJobTarget"
  ADD CONSTRAINT "FactoryJobTarget_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FactoryAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryJobTarget"
  ADD CONSTRAINT "FactoryJobTarget_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "FactoryTemplate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryPublish"
  ADD CONSTRAINT "FactoryPublish_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "FactoryJobTarget"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "FactoryPublish"
  ADD CONSTRAINT "FactoryPublish_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "FactoryAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
