CREATE TABLE "FactoryThumbnail" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "game" "FactoryGame" NOT NULL DEFAULT 'OTHER',
    "filePath" TEXT NOT NULL,
    "storageKey" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactoryThumbnail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FactoryThumbnail_game_idx" ON "FactoryThumbnail"("game");
CREATE INDEX "FactoryThumbnail_isActive_idx" ON "FactoryThumbnail"("isActive");
CREATE INDEX "FactoryThumbnail_createdAt_idx" ON "FactoryThumbnail"("createdAt");
CREATE INDEX "FactoryThumbnail_storageKey_idx" ON "FactoryThumbnail"("storageKey");
