import { createClient } from "redis";

import type { PresenceStore } from "../application/presence.ts";
import { presenceWindow } from "../domain/presence-window.ts";

const COMMAND_TIMEOUT_MS = 2000;

const WINDOW_TTL_SECONDS = 90;

export const createPresenceRedis = (url?: string) =>
  createClient({ url, name: "api-presence", commandOptions: { timeout: COMMAND_TIMEOUT_MS } });

export type PresenceRedis = ReturnType<typeof createPresenceRedis>;

const presenceKey = (channelId: string, window: number): string =>
  `stream:presence:${channelId}:${window}`;

export const redisPresenceStore = (redis: PresenceRedis): PresenceStore => ({
  record: async ({ channelId, viewerId, at }) => {
    const key = presenceKey(channelId, presenceWindow(at));
    await redis.multi().pfAdd(key, viewerId).expire(key, WINDOW_TTL_SECONDS).exec();
  },
  count: async ({ channelIds, at }) => {
    const window = presenceWindow(at);
    const pipeline = redis.multi();
    channelIds.forEach((channelId) => {
      pipeline.pfCount([presenceKey(channelId, window), presenceKey(channelId, window - 1)]);
    });
    const counts = await pipeline.exec();
    return new Map(channelIds.map((channelId, index) => [channelId, Number(counts[index])]));
  },
});
