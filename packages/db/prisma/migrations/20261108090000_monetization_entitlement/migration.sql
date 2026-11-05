-- CreateEnum
CREATE TYPE "monetization"."MonetizationEntitlementScope" AS ENUM ('CHANNEL', 'PLATFORM');

-- CreateEnum
CREATE TYPE "monetization"."MonetizationEntitlementStatus" AS ENUM ('ACTIVE', 'GRACE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "monetization"."MonetizationEntitlementSource" AS ENUM ('APPLE_IAP');

-- CreateTable
CREATE TABLE "monetization"."MonetizationEntitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" "monetization"."MonetizationEntitlementScope" NOT NULL,
    "channelId" UUID,
    "tier" TEXT,
    "status" "monetization"."MonetizationEntitlementStatus" NOT NULL,
    "source" "monetization"."MonetizationEntitlementSource" NOT NULL,
    "providerReference" TEXT,
    "expiresAt" TIMESTAMP(3),
    "willRenew" BOOLEAN NOT NULL DEFAULT true,
    "lastEventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonetizationEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monetization"."MonetizationProcessedWebhookEvent" (
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "MonetizationProcessedWebhookEvent_pkey" PRIMARY KEY ("provider","eventId")
);

-- CreateTable
CREATE TABLE "monetization"."MonetizationOutbox" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,

    CONSTRAINT "MonetizationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonetizationEntitlement_userId_scope_idx" ON "monetization"."MonetizationEntitlement"("userId", "scope");

-- CreateIndex
CREATE INDEX "MonetizationProcessedWebhookEvent_processedAt_nextAttemptAt_idx" ON "monetization"."MonetizationProcessedWebhookEvent"("processedAt", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MonetizationOutbox_publishedAt_nextAttemptAt_idx" ON "monetization"."MonetizationOutbox"("publishedAt", "nextAttemptAt");

-- Un seul entitlement de portée plateforme actif (ACTIVE, GRACE) par utilisateur (ADR 0051 §2).
CREATE UNIQUE INDEX "MonetizationEntitlement_userId_platform_active_key" ON "monetization"."MonetizationEntitlement"("userId") WHERE "scope" = 'PLATFORM' AND "status" IN ('ACTIVE', 'GRACE');

-- Le relais lit et marque les events publiés ; aucun privilège par défaut ne cible les seules outbox.
GRANT USAGE ON SCHEMA "monetization" TO app_outbox_relay;
GRANT SELECT, UPDATE ON "monetization"."MonetizationOutbox" TO app_outbox_relay;
