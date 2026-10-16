-- AlterTable
ALTER TABLE "identity"."IdentityUser" ADD COLUMN     "displayUsername" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IdentityUser_username_key" ON "identity"."IdentityUser"("username");
