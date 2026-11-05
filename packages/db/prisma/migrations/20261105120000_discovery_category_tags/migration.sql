-- AlterTable
ALTER TABLE "discovery"."DiscoveryCategoryView" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
