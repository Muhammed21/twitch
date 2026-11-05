import { request } from "node:http";

import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished } from "vitest";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import { startChatServer, type TokenVerifier } from "./chat-server.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const SPREAD_MS = 600;

const startServer = async (
  verifierOf: (verifier: TokenVerifier) => TokenVerifier = (verifier) => verifier,
) => {
  const authority = await makeTokenAuthority();
  const server = await startChatServer({
    port: 0,
    verifier: verifierOf(authority.verifier()),
    log: () => undefined,
    chatters: {
      displayNameOf: async () => "Alice",
      avatarKeyOf: async () => null,
      sanctionsOf: async () => [],
    },
    rooms: createRoomRegistry({ find: async () => undefined }),
    messages: createMessageSender(createLocalTokenBuckets()),
    saturation: SATURATION_LIMITS,
    adapter: LocalAdapter,
  });

  const connect = async () => {
    const socket = io(`http://127.0.0.1:${server.port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign()}` },
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

  return { server, authority, connect };
};

const closedAt = (socket: Socket) =>
  new Promise<{ readonly at: number; readonly reason: string }>((resolve) => {
    socket.once("disconnect", (reason) => resolve({ at: Date.now(), reason }));
  });

const upgradeStatus = (port: number, token: string) =>
  new Promise<number | undefined>((resolve, reject) => {
    const outgoing = request({
      port,
      path: "/socket.io/?EIO=4&transport=websocket",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        Authorization: `Bearer ${token}`,
      },
    });
    outgoing.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    outgoing.on("response", (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    outgoing.on("error", reject);
    outgoing.end();
  });

describe("arrêt étalé du chat (ADR 0028, §8)", () => {
  it("ferme les sockets par lots étalés sur la durée demandée, comme une coupure réseau", async () => {
    const { server, connect } = await startServer();
    const sockets = await Promise.all(Array.from({ length: 20 }, connect));
    const closures = sockets.map(closedAt);
    const startedAt = Date.now();

    await server.close({ spreadMs: SPREAD_MS });

    const closed = await Promise.all(closures);
    const instants = closed.map(({ at }) => at - startedAt);
    expect(new Set(closed.map(({ reason }) => reason))).toEqual(new Set(["transport close"]));
    expect(Math.min(...instants)).toBeLessThan(SPREAD_MS / 4);
    expect(Math.max(...instants)).toBeGreaterThanOrEqual(SPREAD_MS * 0.8);
    expect(Math.max(...instants)).toBeLessThan(SPREAD_MS * 2);
    expect(
      new Set(instants.map((instant) => Math.floor(instant / (SPREAD_MS / 10)))).size,
    ).toBeGreaterThanOrEqual(5);
  });

  it("refuse les nouveaux upgrades et se déclare indisponible, mais vivant, pendant l'arrêt", async () => {
    const { server, authority, connect } = await startServer();
    await Promise.all(Array.from({ length: 10 }, connect));

    const closing = server.close({ spreadMs: SPREAD_MS });
    const ready = await fetch(`http://127.0.0.1:${server.port}/health/ready`);
    const live = await fetch(`http://127.0.0.1:${server.port}/health/live`);
    const status = await upgradeStatus(server.port, await authority.sign());
    await closing;

    expect(ready.status).toBe(503);
    expect(live.status).toBe(200);
    expect(status).toBe(503);
  });

  it("refuse en 503 l'upgrade dont le jeton était en cours de vérification quand l'arrêt a commencé", async () => {
    const gate: { open: () => void; entered: () => void } = {
      open: () => undefined,
      entered: () => undefined,
    };
    const entered = new Promise<void>((resolve) => {
      gate.entered = resolve;
    });
    const opened = new Promise<void>((resolve) => {
      gate.open = resolve;
    });
    const late = { token: "" };
    const { server, authority, connect } = await startServer((verifier) => ({
      verify: async (token) => {
        if (token === late.token) {
          gate.entered();
          await opened;
        }
        return verifier.verify(token);
      },
    }));
    await Promise.all([connect(), connect()]);
    late.token = await authority.sign({ userId: "late" });

    const status = upgradeStatus(server.port, late.token);
    await entered;
    const closing = server.close({ spreadMs: SPREAD_MS });
    gate.open();

    expect(await status).toBe(503);
    await closing;
  });

  it("s'arrête sans attendre quand aucune socket n'est ouverte", async () => {
    const { server } = await startServer();
    const startedAt = Date.now();

    await server.close({ spreadMs: 30_000 });

    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
