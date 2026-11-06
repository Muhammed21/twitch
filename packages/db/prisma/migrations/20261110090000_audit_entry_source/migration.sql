-- AlterTable
ALTER TABLE "audit"."AuditEntry" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'api';
