CREATE TABLE "FactoryVkAutoSource" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'VK_GROUP',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "publishStartHour" INTEGER NOT NULL DEFAULT 15,
    "publishEndHour" INTEGER NOT NULL DEFAULT 23,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "lastRunDate" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactoryVkAutoSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryVkAutoSourceVideo" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "providerVideoId" TEXT,
    "videoUrl" TEXT NOT NULL,
    "title" TEXT,
    "durationSec" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "factoryJobId" TEXT,
    "pickedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactoryVkAutoSourceVideo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryVkAutoSourceRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STARTED',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "pickedCount" INTEGER NOT NULL DEFAULT 0,
    "createdJobCount" INTEGER NOT NULL DEFAULT 0,
    "publishedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactoryVkAutoSourceRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FactoryVkAutoSource_chatId_idx" ON "FactoryVkAutoSource"("chatId");
CREATE INDEX "FactoryVkAutoSource_isEnabled_idx" ON "FactoryVkAutoSource"("isEnabled");
CREATE INDEX "FactoryVkAutoSource_nextRunAt_idx" ON "FactoryVkAutoSource"("nextRunAt");
CREATE UNIQUE INDEX "FactoryVkAutoSource_chatId_sourceUrl_key" ON "FactoryVkAutoSource"("chatId", "sourceUrl");
CREATE INDEX "FactoryVkAutoSourceVideo_sourceId_idx" ON "FactoryVkAutoSourceVideo"("sourceId");
CREATE INDEX "FactoryVkAutoSourceVideo_status_idx" ON "FactoryVkAutoSourceVideo"("status");
CREATE INDEX "FactoryVkAutoSourceVideo_factoryJobId_idx" ON "FactoryVkAutoSourceVideo"("factoryJobId");
CREATE INDEX "FactoryVkAutoSourceVideo_providerVideoId_idx" ON "FactoryVkAutoSourceVideo"("providerVideoId");
CREATE UNIQUE INDEX "FactoryVkAutoSourceVideo_sourceId_videoUrl_key" ON "FactoryVkAutoSourceVideo"("sourceId", "videoUrl");
CREATE INDEX "FactoryVkAutoSourceRun_sourceId_idx" ON "FactoryVkAutoSourceRun"("sourceId");
CREATE INDEX "FactoryVkAutoSourceRun_runDate_idx" ON "FactoryVkAutoSourceRun"("runDate");
CREATE INDEX "FactoryVkAutoSourceRun_status_idx" ON "FactoryVkAutoSourceRun"("status");
CREATE UNIQUE INDEX "FactoryVkAutoSourceRun_sourceId_runDate_key" ON "FactoryVkAutoSourceRun"("sourceId", "runDate");

ALTER TABLE "FactoryVkAutoSource" ADD CONSTRAINT "FactoryVkAutoSource_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FactoryTelegramChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryVkAutoSourceVideo" ADD CONSTRAINT "FactoryVkAutoSourceVideo_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FactoryVkAutoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryVkAutoSourceVideo" ADD CONSTRAINT "FactoryVkAutoSourceVideo_factoryJobId_fkey" FOREIGN KEY ("factoryJobId") REFERENCES "FactoryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FactoryVkAutoSourceRun" ADD CONSTRAINT "FactoryVkAutoSourceRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FactoryVkAutoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
