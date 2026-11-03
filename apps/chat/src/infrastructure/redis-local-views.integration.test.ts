import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { describe, expect, it, onTestFinished } from "vitest";

import {
  chatterKey,
  redisChatterProfiles,
  redisRoomDirectory,
  roomKey,
} from "./redis-local-views.ts";

const connectRedis = async () => {
  const redis = createClient({ url: process.env["REDIS_URL"] });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

describe("vues locales du chat, contre le Redis de Compose", () => {
  it("lit le salon et le profil écrits dans leurs hashes", async () => {
    const redis = await connectRedis();
    const channelId = `test-chat-${randomUUID()}`;
    const userId = `test-chat-${randomUUID()}`;
    onTestFinished(async () => {
      await redis.del([roomKey(channelId), chatterKey(userId)]);
    });
    await redis.hSet(roomKey(channelId), { sessionId: "" });
    await redis.hSet(chatterKey(userId), { displayName: "Alice" });

    expect(await redisRoomDirectory(redis).find(channelId)).toEqual({
      channelId,
      sessionId: null,
    });
    expect(await redisChatterProfiles(redis).displayNameOf(userId)).toBe("Alice");
  });
});
