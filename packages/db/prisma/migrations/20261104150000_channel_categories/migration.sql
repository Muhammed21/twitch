-- CreateEnum
CREATE TYPE "channel"."ChannelCategoryStatus" AS ENUM ('active', 'merged', 'retired');

-- AlterTable
ALTER TABLE "channel"."Channel" ADD COLUMN     "categoryId" UUID;

-- CreateTable
CREATE TABLE "channel"."ChannelCategory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "channel"."ChannelCategoryStatus" NOT NULL DEFAULT 'active',
    "mergedIntoId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelCategory_slug_key" ON "channel"."ChannelCategory"("slug");

-- AddForeignKey
-- Table chaude (ADR 0008) : NOT VALID évite de parcourir Channel sous verrou ; la validation suit dans 20261104150200.
ALTER TABLE "channel"."Channel" ADD CONSTRAINT "Channel_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "channel"."ChannelCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
