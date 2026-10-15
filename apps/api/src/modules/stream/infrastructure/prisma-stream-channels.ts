import type { StreamChannels } from "../application/stream-keys.ts";
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
