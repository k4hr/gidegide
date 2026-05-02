DO $$ BEGIN
  CREATE TYPE "FactoryPublishTiming" AS ENUM ('NOW', 'NY_14', 'NY_17', 'NY_20', 'NY_22');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "FactoryJob"
ADD COLUMN IF NOT EXISTS "publishTiming" "FactoryPublishTiming" NOT NULL DEFAULT 'NOW',
ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);

ALTER TABLE "FactoryJobTarget"
ADD COLUMN IF NOT EXISTS "maxClips" INTEGER NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS "FactoryJob_publishTiming_idx"
ON "FactoryJob"("publishTiming");

CREATE INDEX IF NOT EXISTS "FactoryJob_scheduledAt_idx"
ON "FactoryJob"("scheduledAt");
