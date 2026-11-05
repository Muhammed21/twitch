-- AlterTable
ALTER TABLE "discovery"."DiscoveryLiveChannelView" ADD COLUMN     "ownerId" UUID;

-- CreateTable
CREATE TABLE "discovery"."DiscoveryAccountAvatar" (
    "accountId" UUID NOT NULL,
    "avatarKey" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryAccountAvatar_pkey" PRIMARY KEY ("accountId")
);
