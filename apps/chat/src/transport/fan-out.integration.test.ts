import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { withSettledCommands } from "../infrastructure/settled-commands.ts";
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
  const logs: Readonly<Record<string, unknown>>[] = [];
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
      log: (entry) => {
        logs.push(entry);
      },
      chatters: { displayNameOf: async () => "Alice", sanctionsOf: async () => [] },
      rooms: createRoomRegistry({ find: async () => room }),
      messages: createMessageSender(),
      saturation: SATURATION_LIMITS,
      adapter: await adapterOf(),
    });
    onTestFinished(() => server.close());
    return server;
  };
  const [a, b] = await Promise.all([startInstance(), startInstance()]);

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

  const startRogue = async () => {
    const rogue = new Server({ adapter: await adapterOf() });
    return rogue;
  };

  return { a, b, joinedOn, logs, startRogue };
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

  it("applique sur l'instance B une sanction reçue par l'instance A", async () => {
    const room = makeRoom();
    const { a, b, joinedOn } = await startCluster(room);
    const bob = await joinedOn(b.port, "bob");

    a.sanction({
      userId: "bob",
      channelId: room.channelId,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });

    await vi.waitFor(() => expect(b.pendingSanctionCount()).toBe(1));
    expect(await say(bob, room.channelId, "encore")).toEqual({ reason: "timed_out" });
  });

  it("écarte et journalise une sanction relayée hors contrat", async () => {
    const room = makeRoom();
    const { b, joinedOn, logs, startRogue } = await startCluster(room);
    const bob = await joinedOn(b.port, "bob");
    const rogue = await startRogue();

    rogue.serverSideEmit("chat:sanction", { userId: "bob", channelId: room.channelId });

    await vi.waitFor(() =>
      expect(logs).toContainEqual({ level: "error", msg: "sanction relayée hors contrat" }),
    );
    expect(b.pendingSanctionCount()).toBe(0);
    expect(await say(bob, room.channelId, "libre")).toBeUndefined();
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
