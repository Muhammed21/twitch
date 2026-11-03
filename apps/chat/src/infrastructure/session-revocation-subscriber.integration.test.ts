import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { io } from "socket.io-client";
import { describe, expect, it, onTestFinished } from "vitest";

import { SESSION_REVOKED_CHANNEL } from "@repo/auth-verifier";

import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import { startChatServer } from "../transport/chat-server.ts";
import { makeTokenAuthority } from "../transport/testing/tokens.ts";
import { subscribeToSessionRevocations } from "./session-revocation-subscriber.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

const connectRedis = async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

describe("révocation de session par le Pub/Sub de Compose", () => {
  it("ferme la socket d'une session dont l'API publie la révocation", async () => {
    const authority = await makeTokenAuthority();
    const server = await startChatServer({
      port: 0,
      verifier: authority.verifier(),
      log: () => {},
      chatters: { displayNameOf: async () => "Alice", sanctionsOf: async () => [] },
      rooms: createRoomRegistry({ find: async () => undefined }),
      messages: createMessageSender(),
    });
    onTestFinished(() => server.close());
    await subscribeToSessionRevocations({
      subscriber: await connectRedis(),
      onRevoked: server.revokeSessions,
      onMalformed: () => {},
    });
    const sid = `test-chat-${randomUUID()}`;
    const socket = io(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign({ sid })}` },
      reconnection: false,
      forceNew: true,
    });
    onTestFinished(() => {
      socket.disconnect();
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const revoked = new Promise<unknown>((resolve) => {
      socket.once("session:revoked", resolve);
    });

    const publisher = await connectRedis();
    await publisher.publish(SESSION_REVOKED_CHANNEL, JSON.stringify({ userId: "u", sids: [sid] }));

    expect(await revoked).toEqual({ action: "stop" });
  });
});
