import type { ChannelPrisma } from "./prisma-channel-registry.ts";

export type OwnedChannelView = {
  readonly id: string;
  readonly slug: string;
};

export const prismaOwnedChannel =
  (prisma: ChannelPrisma) =>
  (ownerId: string): Promise<OwnedChannelView | null> =>
    prisma.channel.findUnique({ where: { ownerId }, select: { id: true, slug: true } });
