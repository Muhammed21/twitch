import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { describe, expect, it, onTestFinished } from "vitest";

import { revokedSidKey } from "@repo/auth-verifier";

import { redisRevokedSessions } from "./redis-revoked-sessions.ts";

const connectRedis = async () => {
  const redis = createClient({ url: process.env["REDIS_URL"] });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const testSid = () => `test-chat-${randomUUID()}`;

describe("redisRevokedSessions, contre le Redis de Compose", () => {
  it("voit révoquée une session que l'API a inscrite, et pas une autre", async () => {
    const redis = await connectRedis();
    const revoked = testSid();
    onTestFinished(async () => {
      await redis.del(revokedSidKey(revoked));
    });
    await redis.set(revokedSidKey(revoked), "1", { expiration: { type: "EX", value: 60 } });
    const revokedSessions = redisRevokedSessions(redis);

    expect(await revokedSessions.isRevoked(revoked)).toBe(true);
    expect(await revokedSessions.isRevoked(testSid())).toBe(false);
  });
});
