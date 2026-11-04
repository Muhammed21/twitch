import type { BioStore } from "../application/change-bio.ts";
import type { AccountDirectory } from "../application/get-current-account.ts";
import type { IdentityPrisma } from "./better-auth.ts";

export const prismaAccountDirectory = (prisma: IdentityPrisma): AccountDirectory => ({
  findById: async (id) => {
    const user = await prisma.identityUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, bio: true },
    });
    if (user === null) {
      return null;
    }
    const { bio, ...account } = user;
    return bio === null ? account : { ...account, bio };
  },
});

export const prismaBioStore = (prisma: IdentityPrisma): BioStore => ({
  saveBio: async ({ userId, bio }) => {
    const { count } = await prisma.identityUser.updateMany({
      where: { id: userId },
      data: { bio: bio ?? null },
    });
    return count > 0;
  },
});
