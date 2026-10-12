-- AlterTable
ALTER TABLE "identity"."IdentityUser" ADD COLUMN     "twoFactorEnabled" BOOLEAN DEFAULT false;

-- CreateTable
CREATE TABLE "identity"."IdentityTwoFactor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN DEFAULT true,
    "failedVerificationCount" INTEGER DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "IdentityTwoFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdentityTwoFactor_secret_idx" ON "identity"."IdentityTwoFactor"("secret");

-- CreateIndex
CREATE INDEX "IdentityTwoFactor_userId_idx" ON "identity"."IdentityTwoFactor"("userId");

-- AddForeignKey
ALTER TABLE "identity"."IdentityTwoFactor" ADD CONSTRAINT "IdentityTwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "identity"."IdentityUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
