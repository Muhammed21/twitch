import { randomUUID } from "node:crypto";

import { io, type Socket } from "socket.io-client";
import { describe, expect, it, onTestFinished } from "vitest";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import type { RoomState } from "../domain/decide.ts";
import { startChatServer } from "./chat-server.ts";
import { createHistogram, renderMetrics } from "./metrics.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { readMetrics } from "./testing/metrics.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const SANCTION_DELAY = "chat_sanction_exclusion_delay_seconds";

const startServer = async (room: RoomState) => {
  const authority = await makeTokenAuthority();
  const server = await startChatServer({
    port: 0,
    verifier: authority.verifier(),
    log: () => undefined,
    chatters: {
      displayNameOf: async () => "Alice",
      avatarKeyOf: async () => null,
      sanctionsOf: async () => [],
    },
    rooms: createRoomRegistry({ find: async () => room }),
    messages: createMessageSender(createLocalTokenBuckets()),
    saturation: SATURATION_LIMITS,
    adapter: LocalAdapter,
  });
  onTestFinished(() => server.close());

  const joined = async (userId: string) => {
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
    socket.emit("room:join", { channelId: room.channelId });
    await say(socket, room.channelId);
    return socket;
  };

  return { server, joined };
};

const say = (socket: Socket, channelId: string) =>
  socket.timeout(2000).emitWithAck("chat:send", { channelId, body: "Bonjour" });

const makeRoom = (): RoomState => ({ channelId: randomUUID(), sessionId: null });

describe("métriques du chat (ADR 0004, ADR 0027 §3)", () => {
  it("expose toutes les métriques à zéro au démarrage, au format texte de Prometheus", async () => {
    const { server } = await startServer(makeRoom());

    const response = await fetch(`http://127.0.0.1:${server.port}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(Object.fromEntries(await readMetrics(server.port))).toEqual({
      chat_connections: 0,
      chat_rooms_loaded: 0,
      chat_saturated_sockets: 0,
      chat_messages_total: 0,
      chat_deliveries_total: 0,
      chat_rejected_events_total: 0,
      chat_saturation_closures_total: 0,
      [`${SANCTION_DELAY}_bucket{le="0.1"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="0.25"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="0.5"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="1"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="2.5"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="5"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="10"}`]: 0,
      [`${SANCTION_DELAY}_bucket{le="+Inf"}`]: 0,
      [`${SANCTION_DELAY}_sum`]: 0,
      [`${SANCTION_DELAY}_count`]: 0,
    });
  });

  it("décrit chaque métrique par son aide et son type", async () => {
    const { server } = await startServer(makeRoom());

    const text = await (await fetch(`http://127.0.0.1:${server.port}/metrics`)).text();

    expect(text.split("\n").filter((line) => line.startsWith("# "))).toEqual([
      "# HELP chat_connections Connexions actives.",
      "# TYPE chat_connections gauge",
      "# HELP chat_rooms_loaded Salons chargés en mémoire.",
      "# TYPE chat_rooms_loaded gauge",
      "# HELP chat_saturated_sockets Sockets exclues de la diffusion pour saturation.",
      "# TYPE chat_saturated_sockets gauge",
      "# HELP chat_messages_total Messages de chat diffusés.",
      "# TYPE chat_messages_total counter",
      "# HELP chat_deliveries_total Livraisons de messages de chat, destinataires compris.",
      "# TYPE chat_deliveries_total counter",
      "# HELP chat_rejected_events_total Trames rejetées par la validation.",
      "# TYPE chat_rejected_events_total counter",
      "# HELP chat_saturation_closures_total Sockets fermées après une saturation prolongée.",
      "# TYPE chat_saturation_closures_total counter",
      `# HELP ${SANCTION_DELAY} Délai entre une sanction et son application aux sockets du chatter.`,
      `# TYPE ${SANCTION_DELAY} histogram`,
    ]);
  });

  it("compte connexions, salons chargés, messages diffusés et livraisons", async () => {
    const room = makeRoom();
    const { server, joined } = await startServer(room);
    const alice = await joined("alice");
    await joined("bob");
    await joined("carol");

    await say(alice, room.channelId);

    const metrics = await readMetrics(server.port);
    expect(metrics.get("chat_connections")).toBe(3);
    expect(metrics.get("chat_rooms_loaded")).toBe(1);
    expect(metrics.get("chat_messages_total")).toBe(4);
    expect(metrics.get("chat_deliveries_total")).toBe(1 + 2 + 3 + 3);
  });

  it("ne compte en livraison que les messages de chat", async () => {
    const room = makeRoom();
    const { server, joined } = await startServer(room);
    const alice = await joined("alice");
    const revoked = new Promise<void>((resolve) => {
      alice.once("disconnect", () => resolve());
    });

    server.revokeSessions(["sid-1"]);
    await revoked;

    expect((await readMetrics(server.port)).get("chat_deliveries_total")).toBe(1);
  });

  it("compte les trames rejetées", async () => {
    const room = makeRoom();
    const { server, joined } = await startServer(room);
    const alice = await joined("alice");

    alice.emit("chat:unknown", {});
    alice.emit("chat:send", { channelId: room.channelId, body: "sans ack" });
    await say(alice, room.channelId);

    expect((await readMetrics(server.port)).get("chat_rejected_events_total")).toBe(2);
  });

  it("range le délai sanction → exclusion dans les seaux de l'histogramme", async () => {
    const { server } = await startServer(makeRoom());

    server.sanctionApplied(new Date(Date.now() - 300));
    server.sanctionApplied(new Date(Date.now() - 4000));

    const metrics = await readMetrics(server.port);
    expect(metrics.get(`${SANCTION_DELAY}_bucket{le="0.25"}`)).toBe(0);
    expect(metrics.get(`${SANCTION_DELAY}_bucket{le="0.5"}`)).toBe(1);
    expect(metrics.get(`${SANCTION_DELAY}_bucket{le="5"}`)).toBe(2);
    expect(metrics.get(`${SANCTION_DELAY}_bucket{le="+Inf"}`)).toBe(2);
    expect(metrics.get(`${SANCTION_DELAY}_sum`)).toBeGreaterThanOrEqual(4.3);
    expect(metrics.get(`${SANCTION_DELAY}_sum`)).toBeLessThan(4.5);
    expect(metrics.get(`${SANCTION_DELAY}_count`)).toBe(2);
  });
});

describe("rendu au format texte de Prometheus", () => {
  it("écrit l'aide et le type de chaque métrique, puis sa valeur", () => {
    const histogram = createHistogram([1, 2]);
    histogram.observe(1);
    histogram.observe(3);

    expect(
      renderMetrics([
        { name: "a_total", help: "Des a.", type: "counter", value: 4 },
        { name: "b", help: "Des b.", type: "gauge", value: 2 },
        { name: "c_seconds", help: "Des c.", type: "histogram", histogram },
      ]),
    ).toBe(
      [
        "# HELP a_total Des a.",
        "# TYPE a_total counter",
        "a_total 4",
        "# HELP b Des b.",
        "# TYPE b gauge",
        "b 2",
        "# HELP c_seconds Des c.",
        "# TYPE c_seconds histogram",
        'c_seconds_bucket{le="1"} 1',
        'c_seconds_bucket{le="2"} 1',
        'c_seconds_bucket{le="+Inf"} 2',
        "c_seconds_sum 4",
        "c_seconds_count 2",
        "",
      ].join("\n"),
    );
  });
});
