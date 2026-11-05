import { randomUUID } from "node:crypto";

import { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";
import { err, ok } from "@repo/result";

import type { AvatarStore } from "../application/change-avatar.ts";
import type { BioStore } from "../application/change-bio.ts";
import type { ChatColorStore } from "../application/change-chat-color.ts";
import type { AccountDirectory } from "../application/get-current-account.ts";
import type { IdentityPrisma } from "./better-auth.ts";

export const prismaAccountDirectory = (prisma: IdentityPrisma): AccountDirectory => ({
  findById: async (id) => {
    const user = await prisma.identityUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, bio: true, avatarKey: true, chatColor: true },
    });
    if (user === null) {
      return null;
    }
    const { bio, avatarKey, chatColor, ...account } = user;
    return {
      ...account,
      ...(bio === null ? {} : { bio }),
      ...(avatarKey === null ? {} : { avatarKey }),
      ...(chatColor === null ? {} : { chatColor }),
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

const OUTBOX = { schema: "identity", table: "IdentityOutbox" };

const { avatarChanged, chatColorChanged } = events.identity;

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
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: randomUUID(),
          name: avatarChanged.name,
          version: avatarChanged.version,
          payload: { accountId: userId, avatarKey } satisfies z.input<typeof avatarChanged.payload>,
          occurredAt: new Date(),
        },
      });
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

const LockedChatColor = z.array(z.object({ chatColor: z.string().nullable() })).max(1);

export const prismaChatColorStore = (prisma: IdentityPrisma): ChatColorStore => ({
  saveChatColor: ({ userId, chatColor }) =>
    prisma.$transaction(async (tx) => {
      const [locked] = LockedChatColor.parse(
        await tx.$queryRaw`SELECT "chatColor" FROM "identity"."IdentityUser" WHERE "id" = ${userId} FOR UPDATE`,
      );
      if (locked === undefined) {
        return err("account_not_found");
      }
      if (locked.chatColor === chatColor) {
        return ok(undefined);
      }
      await tx.identityUser.update({ where: { id: userId }, data: { chatColor } });
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: randomUUID(),
          name: chatColorChanged.name,
          version: chatColorChanged.version,
          payload: { accountId: userId, chatColor } satisfies z.input<
            typeof chatColorChanged.payload
          >,
          occurredAt: new Date(),
        },
      });
      return ok(undefined);
    }),
});
