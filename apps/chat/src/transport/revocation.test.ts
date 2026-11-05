import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished } from "vitest";

import { err } from "@repo/result";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import type { ChatterProfiles } from "../application/ports.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import { startChatServer, type TokenVerifier } from "./chat-server.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";
import { NO_TURBO } from "./testing/turbo.ts";

const deferred = <T>() => {
  const settle: { resolve: (value: T) => void } = { resolve: () => undefined };
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve;
  });
  return { promise, resolve: (value: T) => settle.resolve(value) };
};

const ALICE: ChatterProfiles = {
  displayNameOf: async () => "Alice",
  avatarKeyOf: async () => null,
  sanctionsOf: async () => [],
};

const startServer = async ({ chatters = ALICE }: { chatters?: ChatterProfiles } = {}) => {
  const authority = await makeTokenAuthority();
  const verifier = authority.verifier();
  const expired = new Set<string>();
  const revoked = new Set<string>();
  const controlled: TokenVerifier = {
    verify: async (token) => {
      if (expired.has(token)) {
        return err("invalid_token");
      }
      if (revoked.has(token)) {
        return err("revoked");
      }
      return verifier.verify(token);
    },
  };
  const server = await startChatServer({
    turbos: NO_TURBO,
    port: 0,
    verifier: controlled,
    log: () => undefined,
    chatters,
    rooms: createRoomRegistry({ find: async () => undefined }),
    messages: createMessageSender(createLocalTokenBuckets()),
    saturation: SATURATION_LIMITS,
    adapter: LocalAdapter,
  });
  onTestFinished(() => server.close());

  const connectWith = async (token: string) => {
    const socket = io(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${token}` },
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

  const connectAs = async ({ sid }: { sid: string }) => connectWith(await authority.sign({ sid }));

  const connectWithToken = async ({ sid }: { sid: string }) => {
    const token = await authority.sign({ sid });
    return { token, socket: await connectWith(token) };
  };

  return {
    server,
    sign: authority.sign,
    connectWith,
    connectAs,
    connectWithToken,
    expire: (token: string) => expired.add(token),
    revoke: (token: string) => revoked.add(token),
  };
};

const endOf = (socket: Socket) =>
  new Promise<{ readonly notices: readonly unknown[]; readonly reason: string }>((resolve) => {
    const notices: unknown[] = [];
    socket.on("session:revoked", (notice: unknown) => notices.push(notice));
    socket.once("disconnect", (reason) => resolve({ notices, reason }));
  });

const roundTrip = (socket: Socket) =>
  socket
    .timeout(2000)
    .emitWithAck("chat:send", { channelId: "00000000-0000-4000-8000-000000000000", body: "?" });

const STOPPED = { notices: [{ action: "stop" }], reason: "io server disconnect" };

describe("révocation de session", () => {
  it("prévient puis ferme toutes les sockets du sid révoqué", async () => {
    const { server, connectAs } = await startServer();
    const first = await connectAs({ sid: "sid-revoked" });
    const second = await connectAs({ sid: "sid-revoked" });
    const ends = [endOf(first), endOf(second)];

    server.revokeSessions(["sid-revoked"]);

    expect(await Promise.all(ends)).toEqual([STOPPED, STOPPED]);
  });

  it("ne touche aucune socket d'un autre sid", async () => {
    const { server, connectAs } = await startServer();
    const revoked = await connectAs({ sid: "sid-revoked" });
    const other = await connectAs({ sid: "sid-other" });
    const otherNotices: unknown[] = [];
    other.on("session:revoked", (notice: unknown) => otherNotices.push(notice));

    server.revokeSessions(["sid-revoked"]);
    await endOf(revoked);

    expect(other.connected).toBe(true);
    expect(otherNotices).toEqual([]);
    expect(server.connectionCount()).toBe(1);
  });

  it("ne ferme rien pour une révocation sans sid", async () => {
    const { server, connectAs } = await startServer();
    const socket = await connectAs({ sid: "sid-kept" });
    const notices: unknown[] = [];
    socket.on("session:revoked", (notice: unknown) => notices.push(notice));

    server.revokeSessions([]);

    expect(await roundTrip(socket)).toEqual({ reason: "not_joined" });
    expect(socket.connected).toBe(true);
    expect(notices).toEqual([]);
  });

  it("ferme les sockets de chacun des sid révoqués ensemble", async () => {
    const { server, connectAs } = await startServer();
    const first = await connectAs({ sid: "sid-a" });
    const second = await connectAs({ sid: "sid-b" });
    const ends = [endOf(first), endOf(second)];

    server.revokeSessions(["sid-a", "sid-b"]);

    expect(await Promise.all(ends)).toEqual([STOPPED, STOPPED]);
  });
});

describe("révocation pendant le handshake", () => {
  it("refuse la connexion d'une session révoquée pendant la lecture de son profil", async () => {
    const reading = deferred<void>();
    const profile = deferred<string>();
    const { server, sign, connectWith, revoke } = await startServer({
      chatters: {
        displayNameOf: () => {
          reading.resolve();
          return profile.promise;
        },
        avatarKeyOf: async () => null,
        sanctionsOf: async () => [],
      },
    });
    const token = await sign({ sid: "sid-racing" });
    const connecting = connectWith(token);
    await reading.promise;

    revoke(token);
    server.revokeSessions(["sid-racing"]);
    profile.resolve("Alice");

    await expect(connecting).rejects.toThrow("session_revoked");
  });
});

describe("revalidation périodique", () => {
  it("demande au client de rafraîchir son jeton expiré, puis ferme la socket", async () => {
    const { server, connectWithToken, expire } = await startServer();
    const { token, socket } = await connectWithToken({ sid: "sid-expired" });
    const ended = endOf(socket);
    expire(token);

    await server.revalidateSessions();

    expect(await ended).toEqual({
      notices: [{ action: "refresh_and_reconnect" }],
      reason: "io server disconnect",
    });
  });

  it("arrête une socket dont le sid a été révoqué sans que la révocation lui parvienne", async () => {
    const { server, connectWithToken, revoke } = await startServer();
    const { token, socket } = await connectWithToken({ sid: "sid-missed" });
    const ended = endOf(socket);
    revoke(token);

    await server.revalidateSessions();

    expect(await ended).toEqual(STOPPED);
  });

  it("garde ouverte une socket dont le jeton est toujours valide", async () => {
    const { server, connectWithToken, expire } = await startServer();
    const valid = await connectWithToken({ sid: "sid-valid" });
    const stale = await connectWithToken({ sid: "sid-expired" });
    const ended = endOf(stale.socket);
    expire(stale.token);

    await server.revalidateSessions();
    await ended;

    expect(await roundTrip(valid.socket)).toEqual({ reason: "not_joined" });
    expect(valid.socket.connected).toBe(true);
    expect(server.connectionCount()).toBe(1);
  });
});
