import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { events } from "@repo/contracts";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import { socketSanctionHandlers } from "../application/project-event.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { createConsumerRedis } from "../infrastructure/event-consumer.ts";
import { rateLimitKey, redisTokenBuckets } from "../infrastructure/redis-token-buckets.ts";
import { withSettledCommands } from "../infrastructure/settled-commands.ts";
import { sharedRateLimit } from "../infrastructure/shared-rate-limit.ts";
import { startStreamTail } from "../infrastructure/stream-tail.ts";
import { startChatServer } from "./chat-server.ts";
import { readMetrics } from "./testing/metrics.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

const connectRedis = async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const makeRoom = (): RoomState => ({ channelId: randomUUID(), sessionId: null });

const startCluster = async (room: RoomState) => {
  const authority = await makeTokenAuthority();
  const key = `test-chat-${randomUUID()}`;
  const moderation = `${key}:events.moderation`;
  const adapterOf = async () =>
    createAdapter(
      withSettledCommands(await connectRedis(), () => {}),
      withSettledCommands(await connectRedis(), () => {}),
      { key },
    );
  const startInstance = async () => {
    const server = await startChatServer({
      port: 0,
      verifier: authority.verifier(),
      log: () => {},
      chatters: { displayNameOf: async () => "Alice", sanctionsOf: async () => [] },
      rooms: createRoomRegistry({ find: async () => room }),
      messages: createMessageSender(
        sharedRateLimit({
          shared: redisTokenBuckets(await connectRedis()),
          local: createLocalTokenBuckets(),
          onFallback: () => {},
        }),
      ),
      saturation: SATURATION_LIMITS,
      adapter: await adapterOf(),
    });
    onTestFinished(() => server.close());
    const tailRedis = createConsumerRedis(REDIS_URL);
    await tailRedis.connect();
    onTestFinished(() => tailRedis.destroy());
    const tail = startStreamTail({
      redis: tailRedis,
      stream: moderation,
      handlers: socketSanctionHandlers({ sockets: server, metrics: server, log: () => {} }),
      blockMs: 50,
      onError: () => {},
    });
    onTestFinished(() => tail.stop());
    await vi.waitFor(() => {
      expect(tail.isTailing()).toBe(true);
    });
    return server;
  };
  const [a, b] = await Promise.all([startInstance(), startInstance()]);
  const writer = await connectRedis();
  onTestFinished(async () => {
    await writer.del(moderation);
  });
  const timeOut = async (sanction: { userId: string; channelId: string }) => {
    await writer.xAdd(moderation, "*", {
      id: randomUUID(),
      name: events.moderation.userTimedOut.name,
      version: String(events.moderation.userTimedOut.version),
      occurredAt: new Date().toISOString(),
      payload: JSON.stringify({
        ...sanction,
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }),
    });
  };

  const joinedOn = async (port: number, userId: string) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign({ userId, sid: userId })}` },
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
    socket.emit("room:join", { channelId: room.channelId });
    expect(await say(socket, room.channelId, "présent")).toBeUndefined();
    return socket;
  };

  return { a, b, joinedOn, timeOut };
};

const say = (socket: Socket, channelId: string, body: string) =>
  socket.timeout(2000).emitWithAck("chat:send", { channelId, body });

const collectBodies = (socket: Socket) => {
  const bodies: unknown[] = [];
  socket.on("chat:message", (message: { body?: unknown }) => {
    bodies.push(message.body);
  });
  return bodies;
};

describe("fan-out entre deux instances par le Redis de Compose (ADR 0022, ADR 0027)", () => {
  it("livre à un client de l'instance B un message posté sur l'instance A", async () => {
    const room = makeRoom();
    const { a, b, joinedOn } = await startCluster(room);
    const alice = await joinedOn(a.port, "alice");
    const bob = await joinedOn(b.port, "bob");
    const atBob = collectBodies(bob);

    expect(await say(alice, room.channelId, "bonjour B")).toBeUndefined();

    await vi.waitFor(() => expect(atBob).toEqual(["bonjour B"]));
    expect((await readMetrics(b.port)).get("chat_deliveries_total")).toBe(2);
    expect((await readMetrics(a.port)).get("chat_messages_total")).toBe(2);
    expect((await readMetrics(b.port)).get("chat_messages_total")).toBe(1);
  });

  it("applique sur chaque instance une sanction qu'elle lit elle-même dans Redis Streams", async () => {
    const room = makeRoom();
    const { a, b, joinedOn, timeOut } = await startCluster(room);
    const aliceId = randomUUID();
    const bobId = randomUUID();
    const alice = await joinedOn(a.port, aliceId);
    const bob = await joinedOn(b.port, bobId);

    await timeOut({ userId: aliceId, channelId: room.channelId });
    await timeOut({ userId: bobId, channelId: room.channelId });

    await vi.waitFor(async () => {
      expect((await readMetrics(a.port)).get("chat_sanction_exclusion_delay_seconds_count")).toBe(
        2,
      );
      expect((await readMetrics(b.port)).get("chat_sanction_exclusion_delay_seconds_count")).toBe(
        2,
      );
    });
    expect(await say(alice, room.channelId, "encore")).toEqual({ reason: "timed_out" });
    expect(await say(bob, room.channelId, "encore")).toEqual({ reason: "timed_out" });
  });

  it("ne révoque que ses propres sockets, chaque instance recevant la révocation", async () => {
    const room = makeRoom();
    const { a, b, joinedOn } = await startCluster(room);
    const bob = await joinedOn(b.port, "bob");
    const revocations: unknown[] = [];
    bob.on("session:revoked", (payload: unknown) => {
      revocations.push(payload);
    });

    a.revokeSessions(["bob"]);
    await sleep(200);
    expect(await say(bob, room.channelId, "toujours là")).toBeUndefined();
    const closed = new Promise<void>((resolve) => {
      bob.once("disconnect", () => resolve());
    });
    b.revokeSessions(["bob"]);

    await closed;
    expect(revocations).toEqual([{ action: "stop" }]);
  });
});

const makeChatterId = async () => {
  const userId = randomUUID();
  const redis = await connectRedis();
  onTestFinished(async () => {
    await redis.del(rateLimitKey(userId));
  });
  return userId;
};

describe("rate limit global dans le Redis de Compose (ADR 0004 §6)", () => {
  it("limite au total un utilisateur connecté aux deux instances : le sixième message est refusé", async () => {
    const room = makeRoom();
    const { a, b, joinedOn } = await startCluster(room);
    const userId = await makeChatterId();
    const onA = await joinedOn(a.port, userId);
    const onB = await joinedOn(b.port, userId);

    expect(await say(onA, room.channelId, "troisième")).toBeUndefined();
    expect(await say(onB, room.channelId, "quatrième")).toBeUndefined();
    expect(await say(onA, room.channelId, "cinquième")).toBeUndefined();
    expect(await say(onB, room.channelId, "sixième")).toEqual({ reason: "rate_limited" });
    expect(await say(onA, room.channelId, "septième")).toEqual({ reason: "rate_limited" });
  });

  it("garde sur une seule instance la rafale de 5 et le jeton rendu après une seconde", async () => {
    const room = makeRoom();
    const { a, joinedOn } = await startCluster(room);
    const socket = await joinedOn(a.port, await makeChatterId());
    const burst = ["deuxième", "troisième", "quatrième", "cinquième", "sixième"];

    const acks = await burst.reduce<Promise<readonly unknown[]>>(
      async (previous, body) => [...(await previous), await say(socket, room.channelId, body)],
      Promise.resolve([]),
    );

    expect(acks).toEqual([undefined, undefined, undefined, undefined, { reason: "rate_limited" }]);
    await sleep(1000);
    expect(await say(socket, room.channelId, "après une seconde")).toBeUndefined();
    expect(await say(socket, room.channelId, "trop tôt")).toEqual({ reason: "rate_limited" });
  });
});
