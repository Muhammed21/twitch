-- AlterTable
ALTER TABLE "channel"."ChannelCategory" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
