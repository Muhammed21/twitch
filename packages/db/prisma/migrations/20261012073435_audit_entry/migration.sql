-- CreateTable
CREATE TABLE "audit"."AuditEntry" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "onBehalfOf" TEXT,
    "action" TEXT NOT NULL,
    "scopeType" TEXT,
    "scopeId" TEXT,
    "targetId" TEXT,
    "stateBefore" JSONB,
    "stateAfter" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEntry_targetId_occurredAt_idx" ON "audit"."AuditEntry"("targetId", "occurredAt");
