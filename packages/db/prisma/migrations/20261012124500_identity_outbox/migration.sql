-- CreateTable
CREATE TABLE "identity"."IdentityOutbox" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "IdentityOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityOutbox_publishedAt_nextAttemptAt_idx" ON "identity"."IdentityOutbox"("publishedAt", "nextAttemptAt");


-- Le relais lit et marque les events publiés ; aucun privilège par défaut ne cible les seules outbox.
GRANT USAGE ON SCHEMA "identity" TO app_outbox_relay;
GRANT SELECT, UPDATE ON "identity"."IdentityOutbox" TO app_outbox_relay;
