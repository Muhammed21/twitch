-- CreateTable
CREATE TABLE "stream"."StreamChannel" (
    "channelId" UUID NOT NULL,
    "providerChannelId" TEXT NOT NULL,

    CONSTRAINT "StreamChannel_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "stream"."StreamSession" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "StreamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream"."StreamOutbox" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "StreamOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream"."StreamProcessedEvent" (
    "eventId" UUID NOT NULL,
    "handlerName" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "StreamChannel_providerChannelId_key" ON "stream"."StreamChannel"("providerChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "StreamSession_providerSessionId_key" ON "stream"."StreamSession"("providerSessionId");

-- CreateIndex
CREATE INDEX "StreamSession_channelId_endedAt_idx" ON "stream"."StreamSession"("channelId", "endedAt");

-- CreateIndex
CREATE INDEX "StreamOutbox_publishedAt_nextAttemptAt_idx" ON "stream"."StreamOutbox"("publishedAt", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "StreamProcessedEvent_eventId_handlerName_key" ON "stream"."StreamProcessedEvent"("eventId", "handlerName");

-- Une seule session ouverte par chaîne (ADR 0001) : Prisma ne déclare pas d'index partiel.
CREATE UNIQUE INDEX "StreamSession_channelId_open_key" ON "stream"."StreamSession"("channelId") WHERE "endedAt" IS NULL;

-- Le relais lit et marque les events publiés ; aucun privilège par défaut ne cible les seules outbox.
GRANT USAGE ON SCHEMA "stream" TO app_outbox_relay;
GRANT SELECT, UPDATE ON "stream"."StreamOutbox" TO app_outbox_relay;
