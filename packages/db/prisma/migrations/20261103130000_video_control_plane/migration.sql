-- CreateEnum
CREATE TYPE "video"."VideoSessionState" AS ENUM ('idle', 'live', 'ended');

-- CreateTable
CREATE TABLE "video"."VideoChannel" (
    "id" UUID NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "VideoChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video"."VideoStreamKey" (
    "channelId" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "encryptionKeyVersion" INTEGER NOT NULL,

    CONSTRAINT "VideoStreamKey_pkey" PRIMARY KEY ("channelId")
);

-- CreateTable
CREATE TABLE "video"."VideoIngestSession" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "state" "video"."VideoSessionState" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VideoIngestSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoChannel_externalId_key" ON "video"."VideoChannel"("externalId");

-- AddForeignKey
ALTER TABLE "video"."VideoStreamKey" ADD CONSTRAINT "VideoStreamKey_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "video"."VideoChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video"."VideoIngestSession" ADD CONSTRAINT "VideoIngestSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "video"."VideoChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une seule session live par canal (ADR 0031 §3) : Prisma ne déclare pas d'index partiel.
CREATE UNIQUE INDEX "VideoIngestSession_channelId_live_key" ON "video"."VideoIngestSession"("channelId") WHERE "state" = 'live';

-- Les dates d'une session suivent son état (ADR 0031 §3) : idle sans date, live avec son début, ended avec son début et sa fin.
ALTER TABLE "video"."VideoIngestSession" ADD CONSTRAINT "VideoIngestSession_dates_by_state_check" CHECK (
    ("state" = 'idle' AND "startedAt" IS NULL AND "endedAt" IS NULL)
    OR ("state" = 'live' AND "startedAt" IS NOT NULL AND "endedAt" IS NULL)
    OR ("state" = 'ended' AND "startedAt" IS NOT NULL AND "endedAt" IS NOT NULL)
);
