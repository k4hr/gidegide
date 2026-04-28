-- CreateEnum
CREATE TYPE "LessonPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE_SHORTS');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "platform" "LessonPlatform" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceRub" INTEGER NOT NULL,
    "oldPriceRub" INTEGER,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "lessonId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_slug_key" ON "Lesson"("slug");

-- CreateIndex
CREATE INDEX "Lesson_slug_idx" ON "Lesson"("slug");

-- CreateIndex
CREATE INDEX "Lesson_platform_idx" ON "Lesson"("platform");

-- CreateIndex
CREATE INDEX "Lesson_isActive_idx" ON "Lesson"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");

-- CreateIndex
CREATE INDEX "Order_email_idx" ON "Order"("email");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_lessonId_idx" ON "Order"("lessonId");

-- CreateIndex
CREATE INDEX "Order_accessToken_idx" ON "Order"("accessToken");

-- AddForeignKey
ALTER TABLE "Order"
ADD CONSTRAINT "Order_lessonId_fkey"
FOREIGN KEY ("lessonId")
REFERENCES "Lesson"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
