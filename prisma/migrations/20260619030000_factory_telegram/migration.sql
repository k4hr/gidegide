CREATE TABLE "FactoryTelegramChat" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactoryTelegramChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FactoryTelegramJob" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "factoryJobId" TEXT,
    "telegramMessageId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "lastStatusText" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FactoryTelegramJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FactoryTelegramChat_chatId_key" ON "FactoryTelegramChat"("chatId");
CREATE INDEX "FactoryTelegramChat_chatId_idx" ON "FactoryTelegramChat"("chatId");
CREATE INDEX "FactoryTelegramChat_isAllowed_idx" ON "FactoryTelegramChat"("isAllowed");
CREATE INDEX "FactoryTelegramJob_chatId_idx" ON "FactoryTelegramJob"("chatId");
CREATE INDEX "FactoryTelegramJob_factoryJobId_idx" ON "FactoryTelegramJob"("factoryJobId");
CREATE INDEX "FactoryTelegramJob_status_idx" ON "FactoryTelegramJob"("status");

ALTER TABLE "FactoryTelegramJob" ADD CONSTRAINT "FactoryTelegramJob_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "FactoryTelegramChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FactoryTelegramJob" ADD CONSTRAINT "FactoryTelegramJob_factoryJobId_fkey"
FOREIGN KEY ("factoryJobId") REFERENCES "FactoryJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
