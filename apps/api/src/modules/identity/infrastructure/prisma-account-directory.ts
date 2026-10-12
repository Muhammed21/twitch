import type { AccountDirectory } from "../application/get-current-account.ts";
import type { IdentityPrisma } from "./better-auth.ts";

export const prismaAccountDirectory = (prisma: IdentityPrisma): AccountDirectory => ({
  findById: (id) =>
    prisma.identityUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    }),
});
