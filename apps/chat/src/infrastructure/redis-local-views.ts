import { z } from "zod";

import { ChatColor } from "@repo/contracts";

import type { ChatterProfiles, RoomDirectory, TurboProfiles } from "../application/ports.ts";
import type { RoomState } from "../domain/decide.ts";

export type HashReader = {
  hGetAll(key: string): Promise<Record<string, string>>;
  hGet(key: string, field: string): Promise<string | null>;
};

const RoomView = z.object({ sessionId: z.string() });

export const roomKey = (channelId: string): string => `chat:room:${channelId}`;

export const chatterKey = (userId: string): string => `chat:chatter:${userId}`;

export const sanctionsKey = (userId: string): string => `${chatterKey(userId)}:sanctions`;

const SanctionEnd = z.string().regex(/^\d+$/).transform(Number);

export const TURBO_EXPIRES_AT = "turboExpiresAt";

export const CHAT_COLOR = "chatColor";

const TurboExpiry = SanctionEnd.transform((end) => new Date(end));

const valueOf = <T>(schema: z.ZodType<T>, raw: string | undefined): T | null => {
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

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
  avatarKeyOf: (userId) => redis.hGet(chatterKey(userId), "avatarKey"),
  sanctionsOf: async (userId) =>
    Object.entries(await redis.hGetAll(sanctionsKey(userId))).flatMap(([channelId, end]) => {
      const parsed = SanctionEnd.safeParse(end);
      return parsed.success ? [{ channelId, expiresAt: new Date(parsed.data) }] : [];
    }),
});

export const redisTurboProfiles = (redis: HashReader): TurboProfiles => ({
  turboOf: async (userId) => {
    const view = await redis.hGetAll(chatterKey(userId));
    return {
      expiresAt: valueOf(TurboExpiry, view[TURBO_EXPIRES_AT]),
      chatColor: valueOf(ChatColor, view[CHAT_COLOR]),
    };
  },
});
