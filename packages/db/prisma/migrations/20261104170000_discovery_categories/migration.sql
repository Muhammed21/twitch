-- CreateEnum
CREATE TYPE "discovery"."DiscoveryCategoryStatus" AS ENUM ('active', 'merged', 'retired');

-- AlterTable
ALTER TABLE "discovery"."DiscoveryLiveChannelView" ADD COLUMN     "categoryId" UUID;

-- CreateTable
CREATE TABLE "discovery"."DiscoveryCategoryView" (
    "categoryId" UUID NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "status" "discovery"."DiscoveryCategoryStatus" NOT NULL DEFAULT 'active',
    "mergedIntoId" UUID,

    CONSTRAINT "DiscoveryCategoryView_pkey" PRIMARY KEY ("categoryId")
);
