-- CreateTable
CREATE TABLE "discovery"."DiscoveryLiveChannelView" (
    "channelId" UUID NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "liveSessionId" UUID,
    "liveStartedAt" TIMESTAMP(3),
    "lastEndedAt" TIMESTAMP(3),

    CONSTRAINT "DiscoveryLiveChannelView_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "discovery"."DiscoveryProcessedEvent" (
    "eventId" UUID NOT NULL,
    "handlerName" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveryProcessedEvent_eventId_handlerName_key" ON "discovery"."DiscoveryProcessedEvent"("eventId", "handlerName");
