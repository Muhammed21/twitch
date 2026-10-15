-- CreateTable
CREATE TABLE "channel"."Channel" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel"."ChannelOutbox" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "ChannelOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel"."ChannelProcessedEvent" (
    "eventId" UUID NOT NULL,
    "handlerName" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_ownerId_key" ON "channel"."Channel"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_slug_key" ON "channel"."Channel"("slug");

-- CreateIndex
CREATE INDEX "ChannelOutbox_publishedAt_nextAttemptAt_idx" ON "channel"."ChannelOutbox"("publishedAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelProcessedEvent_eventId_handlerName_key" ON "channel"."ChannelProcessedEvent"("eventId", "handlerName");

-- Le relais lit et marque les events publiés ; aucun privilège par défaut ne cible les seules outbox.
GRANT USAGE ON SCHEMA "channel" TO app_outbox_relay;
GRANT SELECT, UPDATE ON "channel"."ChannelOutbox" TO app_outbox_relay;
