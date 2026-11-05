-- CreateTable
CREATE TABLE "monetization"."MonetizationRejectedWebhook" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonetizationRejectedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonetizationRejectedWebhook_receivedAt_idx" ON "monetization"."MonetizationRejectedWebhook"("receivedAt");

