import type { LiveStatusReader } from "../application/live-status-hub.ts";
import type { DiscoveryPrisma } from "./prisma-live-channel-projection.ts";

export const prismaLiveStatusReader = (prisma: DiscoveryPrisma): LiveStatusReader => ({
  read: async (channelIds) => {
    const views = await prisma.discoveryLiveChannelView.findMany({
      where: { channelId: { in: [...channelIds] } },
      select: { channelId: true, liveSessionId: true, liveStartedAt: true },
      take: channelIds.length,
    });
    return views.map(({ channelId, liveSessionId, liveStartedAt }) => ({
      channelId,
      startedAt: liveSessionId === null || liveStartedAt === null ? undefined : liveStartedAt,
    }));
  },
});
