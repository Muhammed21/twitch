import { z } from "zod";

import type { ChatterProfiles, RoomDirectory } from "../application/ports.ts";
import type { RoomState } from "../domain/decide.ts";

export type HashReader = {
  hGetAll(key: string): Promise<Record<string, string>>;
  hGet(key: string, field: string): Promise<string | null>;
};

const RoomView = z.object({ sessionId: z.string() });

export const roomKey = (channelId: string): string => `chat:room:${channelId}`;

export const chatterKey = (userId: string): string => `chat:chatter:${userId}`;

export const toRoomState = (channelId: string, sessionId: string): RoomState => ({
  channelId,
  sessionId: sessionId === "" ? null : sessionId,
});

export const redisRoomDirectory = (redis: HashReader): RoomDirectory => ({
  find: async (channelId) => {
    const view = RoomView.safeParse(await redis.hGetAll(roomKey(channelId)));
    if (!view.success) {
      return undefined;
    }
    return toRoomState(channelId, view.data.sessionId);
  },
});

export const redisChatterProfiles = (redis: HashReader): ChatterProfiles => ({
  displayNameOf: (userId) => redis.hGet(chatterKey(userId), "displayName"),
});
