-- CreateTable
CREATE TABLE "stream"."StreamViewerCountSample" (
    "sessionId" UUID NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL,
    "viewerCount" INTEGER NOT NULL,

    CONSTRAINT "StreamViewerCountSample_pkey" PRIMARY KEY ("sessionId","sampledAt")
);
