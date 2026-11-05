-- AlterTable
ALTER TABLE "channel"."Channel" ADD COLUMN     "contentLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isBrandedContent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
