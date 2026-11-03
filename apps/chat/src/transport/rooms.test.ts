import { randomUUID } from "node:crypto";

import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { realtime } from "@repo/contracts";

import { createMessageSender } from "../application/message-sender.ts";
import type { ChatterProfiles, RoomDirectory } from "../application/ports.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { startChatServer } from "./chat-server.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const ALICE = randomUUID();
const BOB = randomUUID();
const CAROL = randomUUID();

const DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  [ALICE, "Alice"],
  [BOB, "Bob"],
  [CAROL, "Carol"],
]);

const makeOfflineRoom = (): RoomState => ({ channelId: randomUUID(), sessionId: null });

const makeLiveRoom = (): RoomState => ({ channelId: randomUUID(), sessionId: randomUUID() });

const listDirectory = (rooms: readonly RoomState[]): RoomDirectory => ({
  find: async (channelId) => rooms.find((room) => room.channelId === channelId),
});

const KNOWN_CHATTERS: ChatterProfiles = {
  displayNameOf: async (userId) => DISPLAY_NAMES.get(userId) ?? null,
  sanctionsOf: async () => [],
};

const startServer = async ({
  directory,
  chatters = KNOWN_CHATTERS,
}: {
  directory: RoomDirectory;
  chatters?: ChatterProfiles;
}) => {
  const authority = await makeTokenAuthority();
  const rooms = createRoomRegistry(directory);
  const logs: Readonly<Record<string, unknown>>[] = [];
  const server = await startChatServer({
    port: 0,
    verifier: authority.verifier(),
    log: (entry) => {
      logs.push(entry);
    },
    chatters,
    rooms,
    messages: createMessageSender(),
  });
  onTestFinished(() => server.close());

  const open = async (userId: string) => {
    const socket = io(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign({ userId })}` },
      reconnection: false,
      forceNew: true,
    });
    onTestFinished(() => {
      socket.disconnect();
    });
    return socket;
  };

  const connectAs = async (userId: string) => {
    const socket = await open(userId);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  };

  return { server, rooms, logs, open, connectAs };
};

const send = (socket: Socket, channelId: string, body = "Bonjour le chat") =>
  socket.timeout(2000).emitWithAck("chat:send", { channelId, body });

const nextMessage = (socket: Socket) =>
  new Promise<unknown>((resolve) => {
    socket.once("chat:message", resolve);
  });

const joinAndSync = async (socket: Socket, channelId: string) => {
  const received = nextMessage(socket);
  socket.emit("room:join", { channelId });
  expect(await send(socket, channelId, "présent")).toBeUndefined();
  await received;
};

describe("salons et diffusion", () => {
  it("diffuse un message accepté aux connectés du salon, auteur compris, sans session hors live", async () => {
    const room = makeOfflineRoom();
    const { connectAs } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(bob, room.channelId);
    const atAlice = nextMessage(alice);
    const atBob = nextMessage(bob);

    expect(await send(alice, room.channelId)).toBeUndefined();

    const message = realtime.RealtimeChatMessage.parse(await atBob);
    expect(message).toEqual({
      id: expect.any(String),
      channelId: room.channelId,
      author: { id: ALICE, displayName: "Alice" },
      body: "Bonjour le chat",
      sentAt: expect.any(String),
    });
    expect(await atAlice).toEqual(await atBob);
  });

  it("rattache un message posté pendant un live à la session en cours", async () => {
    const room = makeLiveRoom();
    const { connectAs } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    alice.emit("room:join", { channelId: room.channelId });
    const received = nextMessage(alice);

    expect(await send(alice, room.channelId)).toBeUndefined();
    expect(await received).toMatchObject({ sessionId: room.sessionId });
  });

  it("ne diffuse pas un message aux connectés d'un autre salon", async () => {
    const room = makeOfflineRoom();
    const otherRoom = makeOfflineRoom();
    const { connectAs } = await startServer({ directory: listDirectory([room, otherRoom]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    const carol = await connectAs(CAROL);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(bob, room.channelId);
    await joinAndSync(carol, otherRoom.channelId);
    const atCarol = vi.fn<(message: unknown) => void>();
    carol.on("chat:message", atCarol);
    const atBob = nextMessage(bob);
    await send(alice, room.channelId);
    await atBob;

    await joinAndSync(carol, otherRoom.channelId);

    expect(atCarol).toHaveBeenCalledTimes(1);
    expect(atCarol).toHaveBeenCalledWith(expect.objectContaining({ body: "présent" }));
  });

  it("refuse le sixième message de la rafale par un ack au motif rate_limited, sans le diffuser", async () => {
    const room = makeOfflineRoom();
    const { connectAs } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(bob, room.channelId);
    const atBob = vi.fn<(message: unknown) => void>();
    bob.on("chat:message", atBob);

    const acks = await Promise.all(
      Array.from({ length: 5 }, (_, index) => send(alice, room.channelId, `message ${index}`)),
    );

    expect(acks).toEqual([undefined, undefined, undefined, undefined, { reason: "rate_limited" }]);
    await joinAndSync(bob, room.channelId);
    expect(atBob.mock.calls.map(([message]) => message)).toEqual(
      ["message 0", "message 1", "message 2", "message 3", "présent"].map((body) =>
        expect.objectContaining({ body }),
      ),
    );
  });

  it("refuse not_joined un message pour un salon que le client n'a pas rejoint", async () => {
    const room = makeOfflineRoom();
    const { connectAs } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(bob, room.channelId);

    expect(await send(alice, room.channelId)).toEqual({ reason: "not_joined" });
  });

  it("ne fait pas entrer un client dans le salon d'une chaîne inconnue", async () => {
    const { connectAs, rooms } = await startServer({ directory: listDirectory([]) });
    const alice = await connectAs(ALICE);
    const channelId = randomUUID();
    alice.emit("room:join", { channelId });

    expect(await send(alice, channelId)).toEqual({ reason: "not_joined" });
    expect(rooms.loadedCount()).toBe(0);
  });

  it("laisse hors du salon le client entré avant que la chaîne n'existe", async () => {
    const room = makeOfflineRoom();
    const created = { rooms: new Array<RoomState>() };
    const { connectAs } = await startServer({
      directory: { find: async (channelId) => listDirectory(created.rooms).find(channelId) },
    });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    alice.emit("room:join", { channelId: room.channelId });
    expect(await send(alice, room.channelId)).toEqual({ reason: "not_joined" });

    created.rooms = [room];
    await joinAndSync(bob, room.channelId);

    expect(await send(alice, room.channelId)).toEqual({ reason: "not_joined" });
  });

  it("journalise un salon dont l'état est illisible, sans y faire entrer le client", async () => {
    const { connectAs, logs } = await startServer({
      directory: {
        find: async () => {
          throw new Error("Redis injoignable");
        },
      },
    });
    const alice = await connectAs(ALICE);
    const channelId = randomUUID();
    alice.emit("room:join", { channelId });

    expect(await send(alice, channelId)).toEqual({ reason: "not_joined" });
    expect(logs).toContainEqual({ msg: "événement en échec", error: "Error: Redis injoignable" });
  });
});

describe("salons chargés en mémoire", () => {
  it("libère un salon après la dernière sortie, déconnexion comprise", async () => {
    const room = makeOfflineRoom();
    const { connectAs, rooms } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(bob, room.channelId);

    alice.disconnect();
    bob.emit("room:leave", { channelId: room.channelId });

    expect(await send(bob, room.channelId)).toEqual({ reason: "not_joined" });
    await vi.waitFor(() => expect(rooms.loadedCount()).toBe(0));
  });

  it("compte une seule entrée pour un client qui rejoint deux fois", async () => {
    const room = makeOfflineRoom();
    const { connectAs, rooms } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(alice, room.channelId);

    alice.emit("room:leave", { channelId: room.channelId });

    expect(await send(alice, room.channelId)).toEqual({ reason: "not_joined" });
    expect(rooms.loadedCount()).toBe(0);
  });

  it("ignore la sortie d'un client qui n'avait pas rejoint le salon", async () => {
    const room = makeOfflineRoom();
    const { connectAs, rooms } = await startServer({ directory: listDirectory([room]) });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(alice, room.channelId);

    bob.emit("room:leave", { channelId: room.channelId });

    expect(await send(bob, room.channelId)).toEqual({ reason: "not_joined" });
    expect(rooms.loadedCount()).toBe(1);
  });

  it("ne garde pas le salon d'un client parti pendant le chargement de son état", async () => {
    const room = makeOfflineRoom();
    const loading = { release: () => {} };
    const { server, connectAs, rooms } = await startServer({
      directory: {
        find: () =>
          new Promise((resolve) => {
            loading.release = () => resolve(room);
          }),
      },
    });
    const alice = await connectAs(ALICE);
    alice.emit("room:join", { channelId: room.channelId });
    await vi.waitFor(() => expect(rooms.loadedCount()).toBe(1));

    alice.disconnect();
    await vi.waitFor(() => expect(server.connectionCount()).toBe(0));
    loading.release();

    await vi.waitFor(() => expect(rooms.loadedCount()).toBe(0));
  });

  it("garde le salon des autres quand une sortie attend encore à la déconnexion", async () => {
    const room = makeOfflineRoom();
    const slowRoom = makeOfflineRoom();
    const loading = { requested: false, release: () => {} };
    const { server, connectAs } = await startServer({
      directory: {
        find: async (channelId) =>
          channelId === slowRoom.channelId
            ? new Promise((resolve) => {
                loading.requested = true;
                loading.release = () => resolve(slowRoom);
              })
            : room,
      },
    });
    const alice = await connectAs(ALICE);
    const bob = await connectAs(BOB);
    await joinAndSync(alice, room.channelId);
    await joinAndSync(bob, room.channelId);
    alice.emit("room:join", { channelId: slowRoom.channelId });
    alice.emit("room:leave", { channelId: room.channelId });
    await vi.waitFor(() => expect(loading.requested).toBe(true));

    alice.disconnect();
    await vi.waitFor(() => expect(server.connectionCount()).toBe(1));
    loading.release();

    await joinAndSync(bob, room.channelId);
  });
});

describe("événements refusés", () => {
  it.each([
    ["un événement inconnu", "chat:delete", [{ id: "1" }]],
    ["une charge invalide pour room:join", "room:join", [{ channelId: "pas-un-uuid" }]],
    ["une charge invalide pour room:leave", "room:leave", [{}]],
  ])("rejette et compte %s, sans réponse", async (_name, event, args) => {
    const { server, connectAs } = await startServer({ directory: listDirectory([]) });
    const alice = await connectAs(ALICE);

    alice.emit(event, ...args);

    await vi.waitFor(() => expect(server.rejectedEventCount()).toBe(1));
  });

  it.each([
    ["une charge invalide", { channelId: randomUUID(), body: "" }],
    ["un champ en trop", { channelId: randomUUID(), body: "salut", sessionId: "x" }],
  ])("rejette et compte un chat:send avec %s, sans ack", async (_name, payload) => {
    const { server, connectAs } = await startServer({ directory: listDirectory([]) });
    const alice = await connectAs(ALICE);

    await expect(alice.timeout(200).emitWithAck("chat:send", payload)).rejects.toThrow(
      "operation has timed out",
    );
    expect(server.rejectedEventCount()).toBe(1);
  });

  it("rejette et compte un chat:send sans demande d'ack", async () => {
    const { server, connectAs } = await startServer({ directory: listDirectory([]) });
    const alice = await connectAs(ALICE);

    alice.emit("chat:send", { channelId: randomUUID(), body: "salut" });

    await vi.waitFor(() => expect(server.rejectedEventCount()).toBe(1));
  });
});

describe("profil du chatter", () => {
  it("refuse la connexion socket.io d'un chatter sans profil connu", async () => {
    const { open } = await startServer({ directory: listDirectory([]) });
    const stranger = await open(randomUUID());

    const error = await new Promise<Error>((resolve) => {
      stranger.once("connect_error", resolve);
    });

    expect(error.message).toBe("chatter_unavailable");
  });

  it("refuse la connexion et journalise quand les profils sont illisibles", async () => {
    const { open, logs } = await startServer({
      directory: listDirectory([]),
      chatters: {
        displayNameOf: async () => {
          throw new Error("Redis injoignable");
        },
        sanctionsOf: async () => [],
      },
    });
    const alice = await open(ALICE);

    const error = await new Promise<Error>((resolve) => {
      alice.once("connect_error", resolve);
    });

    expect(error.message).toBe("chatter_unavailable");
    expect(logs).toContainEqual({ msg: "profil illisible", error: "Error: Redis injoignable" });
  });
});
