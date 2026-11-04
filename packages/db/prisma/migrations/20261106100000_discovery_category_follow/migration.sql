-- CreateTable
CREATE TABLE "discovery"."DiscoveryCategoryFollow" (
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "following" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "DiscoveryCategoryFollow_pkey" PRIMARY KEY ("userId","categoryId")
);

-- CreateTable
CREATE TABLE "discovery"."DiscoveryCategoryFollowerCount" (
    "categoryId" UUID NOT NULL,
    "followerCount" INTEGER NOT NULL,

    CONSTRAINT "DiscoveryCategoryFollowerCount_pkey" PRIMARY KEY ("categoryId")
);

