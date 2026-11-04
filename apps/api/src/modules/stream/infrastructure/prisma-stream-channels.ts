import type { StreamChannels } from "../application/stream-keys.ts";
import type { ProviderChannels } from "../application/thumbnail-urls.ts";
import type { StreamPrisma } from "./prisma-stream-sessions.ts";

export const prismaStreamChannels = (prisma: StreamPrisma): StreamChannels => ({
  providerChannelOf: async (channelId) =>
    (await prisma.streamChannel.findUnique({ where: { channelId } }))?.providerChannelId ?? null,
  save: async ({ channelId, providerChannelId }) => {
    await prisma.streamChannel.upsert({
      where: { channelId },
      create: { channelId, providerChannelId },
      update: {},
    });
  },
});

export const prismaProviderChannels = (prisma: StreamPrisma): ProviderChannels => ({
  providerChannelsOf: async (channelIds) =>
    new Map(
      (
        await prisma.streamChannel.findMany({
          where: { channelId: { in: [...channelIds] } },
          take: channelIds.length,
          select: { channelId: true, providerChannelId: true },
        })
      ).map(({ channelId, providerChannelId }) => [channelId, providerChannelId]),
    ),
});
