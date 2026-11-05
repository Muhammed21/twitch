import type { ChannelPrisma } from "./prisma-channel-registry.ts";

export type OwnedChannelView = {
  readonly id: string;
  readonly slug: string;
};

export const prismaOwnedChannel =
  (prisma: ChannelPrisma) =>
  (ownerId: string): Promise<OwnedChannelView | null> =>
    prisma.channel.findUnique({ where: { ownerId }, select: { id: true, slug: true } });

export const prismaOwnedBannerUrl =
  ({ prisma, imageUrlOf }: { prisma: ChannelPrisma; imageUrlOf: (key: string) => string }) =>
  async (ownerId: string): Promise<string | undefined> => {
    const channel = await prisma.channel.findUnique({
      where: { ownerId },
      select: { bannerKey: true },
    });
    const bannerKey = channel?.bannerKey ?? null;
    return bannerKey === null ? undefined : imageUrlOf(bannerKey);
  };
