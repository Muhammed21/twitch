import { z } from "zod";

import { err, ok } from "@repo/result";

import type { AvatarStore } from "../application/change-avatar.ts";
import type { BioStore } from "../application/change-bio.ts";
import type { AccountDirectory } from "../application/get-current-account.ts";
import type { IdentityPrisma } from "./better-auth.ts";

export const prismaAccountDirectory = (prisma: IdentityPrisma): AccountDirectory => ({
  findById: async (id) => {
    const user = await prisma.identityUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, bio: true, avatarKey: true },
    });
    if (user === null) {
      return null;
    }
    const { bio, avatarKey, ...account } = user;
    return {
      ...account,
      ...(bio === null ? {} : { bio }),
      ...(avatarKey === null ? {} : { avatarKey }),
    };
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

const LockedAvatar = z.array(z.object({ avatarKey: z.string().nullable() })).max(1);

export const prismaAvatarStore = (prisma: IdentityPrisma): AvatarStore => ({
  saveAvatar: ({ userId, avatarKey }) =>
    prisma.$transaction(async (tx) => {
      const [locked] = LockedAvatar.parse(
        await tx.$queryRaw`SELECT "avatarKey" FROM "identity"."IdentityUser" WHERE "id" = ${userId} FOR UPDATE`,
      );
      if (locked === undefined) {
        return err("account_not_found");
      }
      await tx.identityUser.update({ where: { id: userId }, data: { avatarKey } });
      return ok({ replacedKey: locked.avatarKey ?? undefined });
    }),
  readAvatarKey: async (userId) => {
    const user = await prisma.identityUser.findUnique({
      where: { id: userId },
      select: { avatarKey: true },
    });
    return user?.avatarKey ?? null;
  },
});
