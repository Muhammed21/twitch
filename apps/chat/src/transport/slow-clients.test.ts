import { once } from "node:events";
import { connect, createServer, type Socket as TcpSocket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { createMessageSender, type MessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { startChatServer } from "./chat-server.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { readMetrics } from "./testing/metrics.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";
import { pendingPacketsOf } from "./write-buffer.ts";

const MAX_PACKETS = 100;
const CLOSE_AFTER_MS = 400;
const NEVER_CLOSE_MS = 60_000;
const BATCH = 20;
const LONG_BODY = "x".repeat(500);

const BoundAddress = z.object({ port: z.int() });

const UNLIMITED_SENDER: MessageSender = {
  ...createMessageSender(),
  send: (input) => createMessageSender().send(input),
};

const startStallableProxy = async (targetPort: number) => {
  const links: { readonly client: TcpSocket; readonly upstream: TcpSocket }[] = [];
  const proxy = createServer((client) => {
    const upstream = connect(targetPort, "127.0.0.1");
    client.on("error", () => undefined);
    upstream.on("error", () => undefined);
    client.pipe(upstream);
    upstream.pipe(client);
    links.push({ client, upstream });
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  return {
    port: BoundAddress.parse(proxy.address()).port,
    stall: () => {
      links.forEach(({ client, upstream }) => {
        upstream.unpipe(client);
        upstream.pause();
      });
    },
    resume: () => {
      links.forEach(({ client, upstream }) => {
        upstream.pipe(client);
      });
    },
    close: () => {
      links.forEach(({ client, upstream }) => {
        client.destroy();
        upstream.destroy();
      });
      proxy.close();
    },
  };
};

const startServer = async (room: RoomState, closeAfterMs: number) => {
  const authority = await makeTokenAuthority();
  const server = await startChatServer({
    port: 0,
    verifier: authority.verifier(),
    log: () => undefined,
    chatters: { displayNameOf: async () => "Alice", sanctionsOf: async () => [] },
    rooms: createRoomRegistry({ find: async (channelId) => ({ ...room, channelId }) }),
    messages: UNLIMITED_SENDER,
    saturation: { maxPackets: MAX_PACKETS, closeAfterMs },
    adapter: LocalAdapter,
  });
  const proxy = await startStallableProxy(server.port);
  const sockets: Socket[] = [];
  onTestFinished(async () => {
    sockets.forEach((socket) => socket.disconnect());
    proxy.close();
    await server.close();
  });

  const connectThrough = async (port: number, userId: string) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      extraHeaders: { Authorization: `Bearer ${await authority.sign({ userId })}` },
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    socket.emit("room:join", { channelId: room.channelId });
    await socket.timeout(2000).emitWithAck("chat:send", { channelId: room.channelId, body: "là" });
    return socket;
  };

  return {
    server,
    proxy,
    connectFast: () => connectThrough(server.port, "fast"),
    connectSlow: () => connectThrough(proxy.port, "slow"),
  };
};

const sendBatch = (socket: Socket, channelId: string) =>
  Promise.all(
    Array.from({ length: BATCH }, () =>
      socket.timeout(5000).emitWithAck("chat:send", { channelId, body: LONG_BODY }),
    ),
  );

const waitFor = async (condition: () => boolean | Promise<boolean>, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error("condition jamais atteinte");
    }
    await sleep(5);
  }
};

const ReceivedMessage = z.object({ body: z.string() });

const collectBodies = (socket: Socket) => {
  const bodies: string[] = [];
  socket.on("chat:message", (message: unknown) => {
    bodies.push(ReceivedMessage.parse(message).body);
  });
  return bodies;
};

const metricOf = async (port: number, name: string) => (await readMetrics(port)).get(name);

const floodUntilSaturated = async (port: number, socket: Socket, channelId: string) => {
  const sent = { count: 0 };
  while ((await metricOf(port, "chat_saturated_sockets")) === 0 && sent.count < 40_000) {
    await sendBatch(socket, channelId);
    sent.count += BATCH;
  }
  return sent;
};

describe("clients lents (ADR 0027, §2)", () => {
  it("exclut puis ferme un client qui ne lit plus, sans perte chez un client rapide du même salon", async () => {
    const room: RoomState = { channelId: crypto.randomUUID(), sessionId: null };
    const { server, proxy, connectFast, connectSlow } = await startServer(room, CLOSE_AFTER_MS);
    const fast = await connectFast();
    await connectSlow();
    const atFast = collectBodies(fast);
    proxy.stall();

    const sent = await floodUntilSaturated(server.port, fast, room.channelId);
    const saturatedAt = Date.now();
    await sendBatch(fast, room.channelId);
    sent.count += BATCH;
    await waitFor(() => server.connectionCount() === 1, CLOSE_AFTER_MS * 10);

    expect(Date.now() - saturatedAt).toBeGreaterThanOrEqual(CLOSE_AFTER_MS * 0.9);
    expect(await metricOf(server.port, "chat_saturation_closures_total")).toBe(1);
    expect(await metricOf(server.port, "chat_saturated_sockets")).toBe(0);
    await waitFor(() => atFast.length === sent.count, 2000);
    expect(fast.connected).toBe(true);
  });

  it("ne diffuse plus rien à un client saturé, puis le rend à la diffusion dès qu'il a vidé son tampon", async () => {
    const room: RoomState = { channelId: crypto.randomUUID(), sessionId: null };
    const { server, proxy, connectFast, connectSlow } = await startServer(room, NEVER_CLOSE_MS);
    const fast = await connectFast();
    const slow = await connectSlow();
    const atSlow = collectBodies(slow);
    const elsewhere = crypto.randomUUID();
    fast.emit("room:join", { channelId: elsewhere });
    proxy.stall();
    const flooded = await floodUntilSaturated(server.port, fast, room.channelId);
    const deliveredBefore = await metricOf(server.port, "chat_deliveries_total");
    await sendBatch(fast, room.channelId);
    await sendBatch(fast, room.channelId);
    await fast.timeout(2000).emitWithAck("chat:send", { channelId: elsewhere, body: "ailleurs" });
    const deliveredWhileSaturated = await metricOf(server.port, "chat_deliveries_total");

    proxy.resume();
    await waitFor(async () => (await metricOf(server.port, "chat_saturated_sockets")) === 0, 5000);
    await fast
      .timeout(2000)
      .emitWithAck("chat:send", { channelId: room.channelId, body: "retour" });
    await waitFor(() => atSlow.includes("retour"), 2000);

    expect(atSlow.length).toBeLessThan(flooded.count + 2 * BATCH + 1);
    expect(Number(deliveredWhileSaturated) - Number(deliveredBefore)).toBe(2 * BATCH + 1);
    expect(server.connectionCount()).toBe(2);
    expect(await metricOf(server.port, "chat_saturation_closures_total")).toBe(0);
  });

  it("compte zéro paquet en attente sur une connexion sans tampon d'écriture lisible", () => {
    expect(pendingPacketsOf({})).toBe(0);
    expect(pendingPacketsOf({ writeBuffer: "abc" })).toBe(0);
    expect(pendingPacketsOf({ writeBuffer: [1, 2, 3] })).toBe(3);
  });
});
