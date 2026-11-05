import { randomUUID } from "node:crypto";

import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { ChatSanction } from "@repo/authorization";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { startChatServer } from "./chat-server.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const ALICE = randomUUID();
const BOB = randomUUID();
const CAROL = randomUUID();

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

const makeRoom = (): RoomState => ({ channelId: randomUUID(), sessionId: null });

const deferred = <T>() => {
  const settle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => settle.resolve(value) };
};

const startServer = async ({
  rooms,
  sanctions = new Map(),
  displayNameOf = async () => "Alice",
  recheck = async () => undefined,
}: {
  rooms: readonly RoomState[];
  sanctions?: ReadonlyMap<string, readonly ChatSanction[]>;
  displayNameOf?: () => Promise<string>;
  recheck?: () => Promise<void>;
}) => {
  const authority = await makeTokenAuthority();
  const verifier = authority.verifier();
  const verified = new Set<string>();
  const server = await startChatServer({
    port: 0,
    verifier: {
      verify: async (token) => {
        if (verified.has(token)) {
          await recheck();
        }
        verified.add(token);
        return verifier.verify(token);
      },
    },
    log: () => undefined,
    chatters: {
      displayNameOf,
      avatarKeyOf: async () => null,
      sanctionsOf: async (userId) => sanctions.get(userId) ?? [],
    },
    rooms: createRoomRegistry({
      find: async (channelId) => rooms.find((room) => room.channelId === channelId),
    }),
    messages: createMessageSender(createLocalTokenBuckets()),
    saturation: SATURATION_LIMITS,
    adapter: LocalAdapter,
  });
  onTestFinished(() => server.close());

  const connectAs = async (userId: string) => {
    const socket = io(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign({ userId })}` },
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
    return socket;
  };

  return { server, connectAs };
};

const send = (socket: Socket, channelId: string) =>
  socket.timeout(2000).emitWithAck("chat:send", { channelId, body: "Bonjour" });

const clearsAt = (socket: Socket) => {
  const cleared: unknown[] = [];
  socket.on("chat:user_cleared", (payload: unknown) => {
    cleared.push(payload);
  });
  return cleared;
};

const joinedAs = async (connect: () => Promise<Socket>, channelId: string) => {
  const socket = await connect();
  socket.emit("room:join", { channelId });
  expect(await send(socket, channelId)).toBeUndefined();
  return socket;
};

describe("sanctions des chatters connectés", () => {
  it("refuse timed_out le message suivant d'un chatter mis en timeout pendant sa connexion", async () => {
    const room = makeRoom();
    const { server, connectAs } = await startServer({ rooms: [room] });
    const alice = await joinedAs(() => connectAs(ALICE), room.channelId);

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(10) });

    expect(await send(alice, room.channelId)).toEqual({ reason: "timed_out" });
  });

  it("laisse écrire les autres chatters du salon", async () => {
    const room = makeRoom();
    const { server, connectAs } = await startServer({ rooms: [room] });
    await joinedAs(() => connectAs(ALICE), room.channelId);
    const bob = await joinedAs(() => connectAs(BOB), room.channelId);

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(10) });

    expect(await send(bob, room.channelId)).toBeUndefined();
  });

  it("applique le timeout à toutes les sockets du chatter, sur ce salon seulement", async () => {
    const timedOutRoom = makeRoom();
    const otherRoom = makeRoom();
    const { server, connectAs } = await startServer({ rooms: [timedOutRoom, otherRoom] });
    const first = await joinedAs(() => connectAs(ALICE), timedOutRoom.channelId);
    const second = await joinedAs(() => connectAs(ALICE), timedOutRoom.channelId);
    second.emit("room:join", { channelId: otherRoom.channelId });

    server.sanction({
      userId: ALICE,
      channelId: timedOutRoom.channelId,
      expiresAt: minutesFromNow(10),
    });

    expect(await send(first, timedOutRoom.channelId)).toEqual({ reason: "timed_out" });
    expect(await send(second, timedOutRoom.channelId)).toEqual({ reason: "timed_out" });
    expect(await send(second, otherRoom.channelId)).toBeUndefined();
  });

  it("refuse dès la connexion le message d'un chatter déjà en timeout", async () => {
    const room = makeRoom();
    const { connectAs } = await startServer({
      rooms: [room],
      sanctions: new Map([[ALICE, [{ channelId: room.channelId, expiresAt: minutesFromNow(10) }]]]),
    });
    const alice = await connectAs(ALICE);
    alice.emit("room:join", { channelId: room.channelId });

    expect(await send(alice, room.channelId)).toEqual({ reason: "timed_out" });
  });

  it("laisse écrire un chatter dont le timeout est échu", async () => {
    const room = makeRoom();
    const { connectAs } = await startServer({
      rooms: [room],
      sanctions: new Map([[ALICE, [{ channelId: room.channelId, expiresAt: minutesFromNow(-1) }]]]),
    });
    const alice = await connectAs(ALICE);
    alice.emit("room:join", { channelId: room.channelId });

    expect(await send(alice, room.channelId)).toBeUndefined();
  });

  it("applique un timeout arrivé pendant la lecture du profil, à la connexion", async () => {
    const room = makeRoom();
    const reading = deferred<void>();
    const profile = deferred<string>();
    const { server, connectAs } = await startServer({
      rooms: [room],
      displayNameOf: () => {
        reading.resolve();
        return profile.promise;
      },
    });
    const connecting = connectAs(ALICE);
    await reading.promise;

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(10) });
    profile.resolve("Alice");
    const alice = await connecting;
    alice.emit("room:join", { channelId: room.channelId });

    expect(await send(alice, room.channelId)).toEqual({ reason: "timed_out" });
  });

  it("applique un timeout arrivé pendant la seconde vérification du jeton, à la connexion", async () => {
    const room = makeRoom();
    const rechecking = deferred<void>();
    const recheck = deferred<void>();
    const { server, connectAs } = await startServer({
      rooms: [room],
      recheck: () => {
        rechecking.resolve();
        return recheck.promise;
      },
    });
    const connecting = connectAs(ALICE);
    await rechecking.promise;

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(10) });
    recheck.resolve();
    const alice = await connecting;
    alice.emit("room:join", { channelId: room.channelId });

    expect(await send(alice, room.channelId)).toEqual({ reason: "timed_out" });
  });

  it("efface les messages du chatter mis en timeout chez tous les connectés du salon", async () => {
    const room = makeRoom();
    const { server, connectAs } = await startServer({ rooms: [room] });
    const alice = await joinedAs(() => connectAs(ALICE), room.channelId);
    const bob = await joinedAs(() => connectAs(BOB), room.channelId);
    const clearedAtAlice = clearsAt(alice);
    const clearedAtBob = clearsAt(bob);

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(10) });

    await vi.waitFor(() => {
      expect(clearedAtBob).toEqual([{ channelId: room.channelId, userId: ALICE }]);
      expect(clearedAtAlice).toEqual([{ channelId: room.channelId, userId: ALICE }]);
    });
  });

  it("n'efface rien dans les autres salons", async () => {
    const timedOutRoom = makeRoom();
    const otherRoom = makeRoom();
    const { server, connectAs } = await startServer({ rooms: [timedOutRoom, otherRoom] });
    const carol = await joinedAs(() => connectAs(CAROL), otherRoom.channelId);
    const bob = await joinedAs(() => connectAs(BOB), timedOutRoom.channelId);
    const clearedAtCarol = clearsAt(carol);
    const clearedAtBob = clearsAt(bob);

    server.sanction({
      userId: ALICE,
      channelId: timedOutRoom.channelId,
      expiresAt: minutesFromNow(10),
    });

    await vi.waitFor(() => {
      expect(clearedAtBob).toHaveLength(1);
    });
    expect(await send(carol, otherRoom.channelId)).toBeUndefined();
    expect(clearedAtCarol).toEqual([]);
  });

  it("oublie les timeouts échus des chatters en cours de connexion", async () => {
    const room = makeRoom();
    const { server } = await startServer({ rooms: [room] });

    server.sanction({ userId: ALICE, channelId: room.channelId, expiresAt: minutesFromNow(-1) });
    server.sanction({ userId: BOB, channelId: room.channelId, expiresAt: minutesFromNow(10) });
    server.sanction({ userId: BOB, channelId: room.channelId, expiresAt: minutesFromNow(-1) });
    server.sanction({ userId: CAROL, channelId: room.channelId, expiresAt: minutesFromNow(10) });

    expect(server.pendingSanctionCount()).toBe(2);
  });
});
