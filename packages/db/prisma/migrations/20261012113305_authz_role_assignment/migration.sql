-- CreateEnum
CREATE TYPE "authz"."AuthzRole" AS ENUM ('owner', 'editor', 'moderator', 'vip', 'banned', 'admin', 'staff', 'support');

-- CreateEnum
CREATE TYPE "authz"."AuthzScopeType" AS ENUM ('platform', 'channel');

-- CreateTable
CREATE TABLE "authz"."AuthzRoleAssignment" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "role" "authz"."AuthzRole" NOT NULL,
    "scopeType" "authz"."AuthzScopeType" NOT NULL,
    "scopeId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "AuthzRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthzRoleAssignment_subjectId_revokedAt_idx" ON "authz"."AuthzRoleAssignment"("subjectId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthzRoleAssignment_scopeType_scopeId_role_revokedAt_idx" ON "authz"."AuthzRoleAssignment"("scopeType", "scopeId", "role", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthzRoleAssignment_subjectId_role_scopeType_scopeId_revoke_key" ON "authz"."AuthzRoleAssignment"("subjectId", "role", "scopeType", "scopeId", "revokedAt");
