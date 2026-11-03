-- AlterTable
ALTER TABLE "video"."VideoStreamKey" ADD COLUMN "fingerprint" BYTEA;

-- CreateIndex
CREATE UNIQUE INDEX "VideoStreamKey_fingerprint_key" ON "video"."VideoStreamKey"("fingerprint");
