import { once } from "node:events";
import { readFileSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { type RtmpServerStats, startRtmpServer } from "./rtmp-server.ts";

const FFMPEG_PUBLISH = new Uint8Array(
  readFileSync(new URL("./testing/ffmpeg-publish-handshake.bin", import.meta.url)),
);
const C0C1 = FFMPEG_PUBLISH.subarray(0, 1537);
const C1 = FFMPEG_PUBLISH.subarray(1, 1537);
const C2_AND_CONNECT = FFMPEG_PUBLISH.subarray(1537);

const HANDSHAKE_TIMEOUT_MS = 150;
const IDLE_TIMEOUT_MS = 150;

const startServer = async ({ handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS } = {}) => {
  const server = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    randomBytes: (size) => new Uint8Array(size).fill(7),
  });
  onTestFinished(() => server.close());
  return server;
};

const openClient = async (port: number) => {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  const received: Buffer[] = [];
  socket.on("error", () => undefined);
  socket.on("data", (chunk: Buffer) => received.push(chunk));
  const closed = new Promise<true>((resolve) => {
    socket.once("close", () => resolve(true));
  });
  onTestFinished(() => {
    socket.destroy();
  });
  return {
    socket,
    received: () => Buffer.concat(received),
    closed,
    isClosed: () => Promise.race([closed, sleep(0).then(() => false)]),
  };
};

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 2000;
  while (!condition() && Date.now() < deadline) {
    await sleep(5);
  }
};

const handshakeWith = async (
  socket: Socket,
  received: () => Buffer,
  stats: () => RtmpServerStats,
) => {
  socket.write(C0C1);
  await waitFor(() => received().length >= 3073);
  socket.write(C2_AND_CONNECT);
  await waitFor(() => stats().handshakes === 1);
};

const NO_REJECTION = { unsupported_version: 0, handshake_timeout: 0, idle_timeout: 0 };

describe("serveur RTMP, poignée de main (ADR 0031, §3)", () => {
  it("rejoue la poignée de main de ffmpeg : S0, S1 aléatoire, S2 en écho de C1", async () => {
    const server = await startServer();
    const client = await openClient(server.port);

    await handshakeWith(client.socket, client.received, server.stats);

    const reply = client.received();
    expect(reply).toHaveLength(3073);
    expect(reply[0]).toBe(3);
    expect(reply.subarray(1, 9)).toEqual(Buffer.alloc(8));
    expect(reply.subarray(9, 1537)).toEqual(Buffer.alloc(1528, 7));
    expect(reply.subarray(1537)).toEqual(Buffer.from(C1));
    expect(server.stats()).toEqual({ connections: 1, handshakes: 1, rejections: NO_REJECTION });
  });

  it("ferme une connexion d'une autre version que 3 et compte le rejet", async () => {
    const server = await startServer();
    const client = await openClient(server.port);

    client.socket.write(Uint8Array.of(6));

    expect(await client.closed).toBe(true);
    expect(client.received()).toHaveLength(0);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, unsupported_version: 1 });
  });

  it("ferme une poignée de main qui traîne, même si des octets arrivent au compte-gouttes", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    const trickle = C0C1.subarray(0, 40);

    const startedAt = performance.now();
    for (const byte of trickle) {
      if (await client.isClosed()) {
        break;
      }
      client.socket.write(Uint8Array.of(byte));
      await sleep(10);
    }

    expect(await client.closed).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(HANDSHAKE_TIMEOUT_MS * 3);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, handshake_timeout: 1 });
  });

  it("ferme une connexion silencieuse après la poignée de main et compte le rejet", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    await handshakeWith(client.socket, client.received, server.stats);

    expect(await client.closed).toBe(true);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, idle_timeout: 1 });
  });

  it("garde ouverte une connexion qui envoie des données après la poignée de main", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    await handshakeWith(client.socket, client.received, server.stats);

    for (const _ of Array.from({ length: 6 })) {
      client.socket.write(Uint8Array.of(0));
      await sleep(IDLE_TIMEOUT_MS / 3);
    }

    expect(await client.isClosed()).toBe(false);
    expect(server.stats().rejections).toEqual(NO_REJECTION);
  });

  it("survit à un client qui coupe brutalement la connexion", async () => {
    const server = await startServer();
    const brutal = await openClient(server.port);
    brutal.socket.write(C0C1);
    brutal.socket.resetAndDestroy();
    await brutal.closed;
    await sleep(20);

    const client = await openClient(server.port);
    await handshakeWith(client.socket, client.received, server.stats);

    expect(server.stats().handshakes).toBe(1);
  });

  it("ne compte ni ne rejette un client parti de lui-même pendant la poignée de main", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    client.socket.write(C0C1.subarray(0, 1));
    await waitFor(() => server.stats().connections === 1);

    client.socket.end();
    await client.closed;
    await sleep(HANDSHAKE_TIMEOUT_MS * 2);

    expect(server.stats()).toEqual({ connections: 0, handshakes: 0, rejections: NO_REJECTION });
  });

  it("ferme sans attendre les connexions ouvertes à l'arrêt", async () => {
    const server = await startServer({ handshakeTimeoutMs: 60_000 });
    const client = await openClient(server.port);
    client.socket.write(C0C1.subarray(0, 1));
    await waitFor(() => server.stats().connections === 1);
    const startedAt = performance.now();

    await server.close();

    expect(await client.closed).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
