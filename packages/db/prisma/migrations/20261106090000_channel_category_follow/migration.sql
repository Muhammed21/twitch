-- CreateEnum
CREATE TYPE "channel"."ChannelCategoryFollowState" AS ENUM ('following', 'not_following');

-- CreateEnum
CREATE TYPE "channel"."ChannelCategoryFollowEndedReason" AS ENUM ('unfollowed', 'category_merged', 'category_retired');

-- CreateTable
CREATE TABLE "channel"."ChannelCategoryFollow" (
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "state" "channel"."ChannelCategoryFollowState" NOT NULL,
    "followedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL,
    "endedReason" "channel"."ChannelCategoryFollowEndedReason",

    CONSTRAINT "ChannelCategoryFollow_pkey" PRIMARY KEY ("userId","categoryId")
);

-- CreateIndex
CREATE INDEX "ChannelCategoryFollow_categoryId_state_idx" ON "channel"."ChannelCategoryFollow"("categoryId", "state");

-- AddForeignKey
ALTER TABLE "channel"."ChannelCategoryFollow" ADD CONSTRAINT "ChannelCategoryFollow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "channel"."ChannelCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
