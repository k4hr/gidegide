-- CreateTable
CREATE TABLE "FactoryInstagramAutoSource" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "username" TEXT,
    "sourceTitle" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT 10,
    "publishStartHour" INTEGER NOT NULL DEFAULT 18,
    "publishEndHour" INTEGER NOT NULL DEFAULT 23,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "lastRunDate" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryInstagramAutoSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryInstagramAutoSourceVideo" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "shortcode" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" BIGINT,
    "hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "factoryJobId" TEXT,
    "pickedAt" TIMESTAMP(3),
    "downloadedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryInstagramAutoSourceVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactoryInstagramAutoSourceRun" (
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

    CONSTRAINT "FactoryInstagramAutoSourceRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactoryInstagramAutoSource_chatId_sourceUrl_key" ON "FactoryInstagramAutoSource"("chatId", "sourceUrl");
CREATE INDEX "FactoryInstagramAutoSource_chatId_idx" ON "FactoryInstagramAutoSource"("chatId");
CREATE INDEX "FactoryInstagramAutoSource_username_idx" ON "FactoryInstagramAutoSource"("username");
CREATE INDEX "FactoryInstagramAutoSource_isEnabled_idx" ON "FactoryInstagramAutoSource"("isEnabled");
CREATE INDEX "FactoryInstagramAutoSource_nextRunAt_idx" ON "FactoryInstagramAutoSource"("nextRunAt");

CREATE UNIQUE INDEX "FactoryInstagramAutoSourceVideo_sourceId_sourceUrl_key" ON "FactoryInstagramAutoSourceVideo"("sourceId", "sourceUrl");
CREATE INDEX "FactoryInstagramAutoSourceVideo_sourceId_idx" ON "FactoryInstagramAutoSourceVideo"("sourceId");
CREATE INDEX "FactoryInstagramAutoSourceVideo_shortcode_idx" ON "FactoryInstagramAutoSourceVideo"("shortcode");
CREATE INDEX "FactoryInstagramAutoSourceVideo_hash_idx" ON "FactoryInstagramAutoSourceVideo"("hash");
CREATE INDEX "FactoryInstagramAutoSourceVideo_status_idx" ON "FactoryInstagramAutoSourceVideo"("status");
CREATE INDEX "FactoryInstagramAutoSourceVideo_factoryJobId_idx" ON "FactoryInstagramAutoSourceVideo"("factoryJobId");
CREATE INDEX "FactoryInstagramAutoSourceVideo_pickedAt_idx" ON "FactoryInstagramAutoSourceVideo"("pickedAt");

CREATE UNIQUE INDEX "FactoryInstagramAutoSourceRun_sourceId_runDate_key" ON "FactoryInstagramAutoSourceRun"("sourceId", "runDate");
CREATE INDEX "FactoryInstagramAutoSourceRun_sourceId_idx" ON "FactoryInstagramAutoSourceRun"("sourceId");
CREATE INDEX "FactoryInstagramAutoSourceRun_runDate_idx" ON "FactoryInstagramAutoSourceRun"("runDate");
CREATE INDEX "FactoryInstagramAutoSourceRun_status_idx" ON "FactoryInstagramAutoSourceRun"("status");

-- AddForeignKey
ALTER TABLE "FactoryInstagramAutoSource" ADD CONSTRAINT "FactoryInstagramAutoSource_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "FactoryTelegramChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD CONSTRAINT "FactoryInstagramAutoSourceVideo_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FactoryInstagramAutoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FactoryInstagramAutoSourceVideo" ADD CONSTRAINT "FactoryInstagramAutoSourceVideo_factoryJobId_fkey" FOREIGN KEY ("factoryJobId") REFERENCES "FactoryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FactoryInstagramAutoSourceRun" ADD CONSTRAINT "FactoryInstagramAutoSourceRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "FactoryInstagramAutoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
