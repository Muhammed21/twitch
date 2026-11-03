-- CreateTable
CREATE TABLE "video"."VideoOutbox" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "VideoOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoOutbox_publishedAt_nextAttemptAt_idx" ON "video"."VideoOutbox"("publishedAt", "nextAttemptAt");

-- Le relais d'apps/video lit et marque les events publiés ; aucun privilège par défaut ne cible les seules outbox.
GRANT USAGE ON SCHEMA "video" TO app_outbox_relay;
GRANT SELECT, UPDATE ON "video"."VideoOutbox" TO app_outbox_relay;
