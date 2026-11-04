-- CreateTable
CREATE TABLE "discovery"."DiscoveryCategoryAudience" (
    "categoryId" UUID NOT NULL,
    "liveCount" INTEGER NOT NULL,
    "viewerCount" INTEGER NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveryCategoryAudience_pkey" PRIMARY KEY ("categoryId")
);

-- CreateIndex
CREATE INDEX "DiscoveryCategoryAudience_viewerCount_liveCount_categoryId_idx" ON "discovery"."DiscoveryCategoryAudience"("viewerCount" DESC, "liveCount" DESC, "categoryId");
