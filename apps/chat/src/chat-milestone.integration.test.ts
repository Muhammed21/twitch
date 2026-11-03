import { randomUUID } from "node:crypto";

import { createClient } from "redis";
import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { events, realtime } from "@repo/contracts";

import { createMessageSender } from "./application/message-sender.ts";
import { chatEventHandlers } from "./application/project-event.ts";
import { createRoomRegistry } from "./application/room-registry.ts";
import { createConsumerRedis, startEventConsumer } from "./infrastructure/event-consumer.ts";
import { redisLocalViewWriter } from "./infrastructure/redis-local-view-writer.ts";
import {
  chatterKey,
  redisChatterProfiles,
  redisRoomDirectory,
  roomKey,
  sanctionsKey,
} from "./infrastructure/redis-local-views.ts";
import { startChatServer } from "./transport/chat-server.ts";
import { LocalAdapter } from "./transport/testing/local-adapter.ts";
import { readMetrics } from "./transport/testing/metrics.ts";
import { SATURATION_LIMITS } from "./transport/testing/saturation.ts";
import { makeTokenAuthority } from "./transport/testing/tokens.ts";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

const connectRedis = async () => {
  const redis = createConsumerRedis(REDIS_URL);
  await redis.connect();
  onTestFinished(() => redis.destroy());
  return redis;
};

const startChat = async () => {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();
  onTestFinished(() => redis.destroy());
  const consumerRedis = await connectRedis();
  const prefix = `test-chat-${randomUUID()}`;
  const streams = {
    channel: `${prefix}:events.channel`,
    stream: `${prefix}:events.stream`,
    identity: `${prefix}:events.identity`,
    moderation: `${prefix}:events.moderation`,
  };
  const keys: string[] = Object.values(streams);
  onTestFinished(async () => {
    await redis.del(keys);
  });
  const authority = await makeTokenAuthority();
  const rooms = createRoomRegistry(redisRoomDirectory(redis));
  const server = await startChatServer({
    port: 0,
    verifier: authority.verifier(),
    log: () => {},
    chatters: redisChatterProfiles(redis),
    rooms,
    messages: createMessageSender(),
    saturation: SATURATION_LIMITS,
    adapter: LocalAdapter,
  });
  onTestFinished(() => server.close());
  const consumer = startEventConsumer({
    redis: consumerRedis,
    streams: Object.values(streams),
    group: "chat",
    consumer: "test",
    handlers: chatEventHandlers({
      views: redisLocalViewWriter(redis),
      rooms,
      sockets: server,
      metrics: server,
      log: () => {},
    }),
    claimIdleMs: 30_000,
    blockMs: 50,
    onError: () => {},
  });
  onTestFinished(() => consumer.stop());

  const publish = async (
    stream: string,
    contract: { readonly name: string; readonly version: number },
    payload: unknown,
  ) => {
    await redis.xAdd(stream, "*", {
      id: randomUUID(),
      name: contract.name,
      version: String(contract.version),
      occurredAt: new Date().toISOString(),
      payload: JSON.stringify(payload),
    });
  };

  const registerAccount = async (displayName: string) => {
    const accountId = randomUUID();
    keys.push(chatterKey(accountId));
    await publish(streams.identity, events.identity.accountRegistered, {
      accountId,
      displayName,
    });
    return accountId;
  };

  const createChannel = async (ownerId: string) => {
    const channelId = randomUUID();
    keys.push(roomKey(channelId));
    await publish(streams.channel, events.channel.channelCreated, {
      channelId,
      ownerId,
      slug: `chaine-${channelId}`,
    });
    return channelId;
  };

  const startLive = async (channelId: string) => {
    const sessionId = randomUUID();
    await publish(streams.stream, events.stream.streamStarted, {
      sessionId,
      channelId,
      startedAt: new Date().toISOString(),
    });
    return sessionId;
  };

  const timeOut = async ({ channelId, userId }: { channelId: string; userId: string }) => {
    keys.push(sanctionsKey(userId));
    await publish(streams.moderation, events.moderation.userTimedOut, {
      channelId,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  };

  const connectAs = async (userId: string): Promise<Socket> => {
    const token = await authority.sign({ userId });
    return vi.waitFor(
      () =>
        new Promise<Socket>((resolve, reject) => {
          const socket = io(`http://127.0.0.1:${server.port}`, {
            transports: ["websocket"],
            extraHeaders: { Authorization: `Bearer ${token}` },
            reconnection: false,
            forceNew: true,
          });
          onTestFinished(() => {
            socket.disconnect();
          });
          socket.once("connect", () => resolve(socket));
          socket.once("connect_error", reject);
        }),
      { timeout: 5000, interval: 50 },
    );
  };

  return {
    port: server.port,
    redis,
    rooms,
    registerAccount,
    createChannel,
    startLive,
    timeOut,
    connectAs,
  };
};

const nextMessage = (socket: Socket) =>
  new Promise<unknown>((resolve) => {
    socket.once("chat:message", resolve);
  });

const send = (socket: Socket, channelId: string, body: string) =>
  socket.timeout(2000).emitWithAck("chat:send", { channelId, body });

const joinWhenOpen = (socket: Socket, channelId: string) =>
  vi.waitFor(
    async () => {
      socket.emit("room:join", { channelId });
      expect(await send(socket, channelId, "présent")).toBeUndefined();
    },
    { timeout: 5000, interval: 50 },
  );

describe("jalon C1, contre le Redis de Compose", () => {
  it("deux clients authentifiés échangent dans le salon d'une chaîne créée, puis pendant son live", async () => {
    const chat = await startChat();
    const alice = await chat.registerAccount("Alice");
    const bob = await chat.registerAccount("Bob");
    const channelId = await chat.createChannel(alice);
    const aliceSocket = await chat.connectAs(alice);
    const bobSocket = await chat.connectAs(bob);
    await joinWhenOpen(aliceSocket, channelId);
    await joinWhenOpen(bobSocket, channelId);

    const offline = nextMessage(bobSocket);
    expect(await send(aliceSocket, channelId, "Bonjour Bob")).toBeUndefined();
    expect(realtime.RealtimeChatMessage.parse(await offline)).toEqual({
      id: expect.any(String),
      channelId,
      author: { id: alice, displayName: "Alice" },
      body: "Bonjour Bob",
      sentAt: expect.any(String),
    });

    const sessionId = await chat.startLive(channelId);
    await vi.waitFor(() => expect(chat.rooms.state(channelId)).toEqual({ channelId, sessionId }));
    const live = nextMessage(aliceSocket);
    expect(await send(bobSocket, channelId, "Bon live")).toBeUndefined();
    expect(await live).toMatchObject({
      author: { id: bob, displayName: "Bob" },
      body: "Bon live",
      sessionId,
    });
  });
});

describe("jalon C2, contre le Redis de Compose", () => {
  it("un timeout publié coupe l'auteur en moins d'une seconde, sans toucher les autres", async () => {
    const chat = await startChat();
    const owner = await chat.registerAccount("Alice");
    const viewer = await chat.registerAccount("Bob");
    const channelId = await chat.createChannel(owner);
    const ownerSocket = await chat.connectAs(owner);
    const viewerSocket = await chat.connectAs(viewer);
    await joinWhenOpen(ownerSocket, channelId);
    await joinWhenOpen(viewerSocket, channelId);

    const publishedAt = Date.now();
    await chat.timeOut({ channelId, userId: viewer });
    await vi.waitFor(
      async () =>
        expect(await send(viewerSocket, channelId, "encore")).toEqual({ reason: "timed_out" }),
      { timeout: 1000, interval: 20 },
    );

    expect(Date.now() - publishedAt).toBeLessThan(1000);
    expect(await send(ownerSocket, channelId, "toujours là")).toBeUndefined();
    const metrics = await readMetrics(chat.port);
    expect(metrics.get("chat_sanction_exclusion_delay_seconds_count")).toBe(1);
    expect(metrics.get('chat_sanction_exclusion_delay_seconds_bucket{le="1"}')).toBe(1);
  });

  it("applique le timeout publié pendant l'absence du chatter dès sa reconnexion", async () => {
    const chat = await startChat();
    const owner = await chat.registerAccount("Alice");
    const viewer = await chat.registerAccount("Bob");
    const channelId = await chat.createChannel(owner);
    const ownerSocket = await chat.connectAs(owner);
    await joinWhenOpen(ownerSocket, channelId);

    await chat.timeOut({ channelId, userId: viewer });
    await chat.timeOut({ channelId, userId: viewer });
    await vi.waitFor(async () => expect(await chat.redis.hLen(sanctionsKey(viewer))).toBe(1));
    const viewerSocket = await chat.connectAs(viewer);
    viewerSocket.emit("room:join", { channelId });

    expect(await send(viewerSocket, channelId, "me revoilà")).toEqual({ reason: "timed_out" });
  });
});
