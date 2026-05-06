CREATE TYPE "FactoryCutMode" AS ENUM ('SEQUENTIAL', 'SMART_LITE');

ALTER TABLE "FactoryJob"
ADD COLUMN "cutMode" "FactoryCutMode" NOT NULL DEFAULT 'SEQUENTIAL',
ADD COLUMN "smartStepSeconds" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN "smartCandidates" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN "smartMinGapSeconds" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "FactoryClipCandidate" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "startSec" INTEGER NOT NULL,
  "endSec" INTEGER NOT NULL,
  "durationSec" INTEGER NOT NULL,
  "motionScore" INTEGER NOT NULL DEFAULT 0,
  "audioScore" INTEGER NOT NULL DEFAULT 0,
  "firstFrameScore" INTEGER NOT NULL DEFAULT 0,
  "sceneScore" INTEGER NOT NULL DEFAULT 0,
  "finalScore" INTEGER NOT NULL DEFAULT 0,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FactoryClipCandidate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FactoryClipCandidate_jobId_idx" ON "FactoryClipCandidate"("jobId");
CREATE INDEX "FactoryClipCandidate_finalScore_idx" ON "FactoryClipCandidate"("finalScore");
CREATE INDEX "FactoryClipCandidate_selected_idx" ON "FactoryClipCandidate"("selected");

ALTER TABLE "FactoryClipCandidate"
ADD CONSTRAINT "FactoryClipCandidate_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "FactoryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FactoryJob_cutMode_idx" ON "FactoryJob"("cutMode");
