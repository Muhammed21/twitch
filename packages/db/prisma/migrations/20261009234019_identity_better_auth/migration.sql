-- CreateTable
CREATE TABLE "identity"."IdentityUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentitySession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "IdentitySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."IdentityVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityUser_email_key" ON "identity"."IdentityUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IdentitySession_token_key" ON "identity"."IdentitySession"("token");

-- CreateIndex
CREATE INDEX "IdentitySession_userId_idx" ON "identity"."IdentitySession"("userId");

-- CreateIndex
CREATE INDEX "IdentityAccount_userId_idx" ON "identity"."IdentityAccount"("userId");

-- CreateIndex
CREATE INDEX "IdentityVerification_identifier_idx" ON "identity"."IdentityVerification"("identifier");

-- AddForeignKey
ALTER TABLE "identity"."IdentitySession" ADD CONSTRAINT "IdentitySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."IdentityAccount" ADD CONSTRAINT "IdentityAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
