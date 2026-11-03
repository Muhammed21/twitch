import { once } from "node:events";
import { connect, type Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";

import { decodeAmf0, encodeAmf0 } from "./amf0.ts";
import { demuxChunks, type RtmpMessage, startDemuxer } from "./chunk-stream.ts";
import { type Publication, type RtmpServerStats, startRtmpServer } from "./rtmp-server.ts";
import {
  concatBytes,
  FFMPEG_PUBLISH,
  FFMPEG_PUBLISH_FLV_TAGS,
  FFMPEG_STREAM_KEY,
  ffmpegPublishThrough,
  makeChunk,
} from "./testing/rtmp-fixtures.ts";

const C0C1 = FFMPEG_PUBLISH.subarray(0, 1537);
const C1 = FFMPEG_PUBLISH.subarray(1, 1537);
const C2_AND_CHUNKS = FFMPEG_PUBLISH.subarray(1537);
const MAX_MESSAGE_SIZE = 8192;

const HANDSHAKE_TIMEOUT_MS = 150;
const IDLE_TIMEOUT_MS = 150;
const PUBLISH_TIMEOUTS = { handshakeTimeoutMs: 2000, idleTimeoutMs: 2000 };

type PublishGate = (streamKey: string) => Promise<Publication | undefined>;

const makePublishLog = () => {
  const entries: string[] = [];
  const accepting: PublishGate = async (streamKey) => {
    entries.push(`publish ${streamKey}`);
    return {
      end: async () => {
        entries.push(`end ${streamKey}`);
      },
    };
  };
  return { entries, accepting };
};

const startServer = async ({
  handshakeTimeoutMs = HANDSHAKE_TIMEOUT_MS,
  idleTimeoutMs = IDLE_TIMEOUT_MS,
  publish = makePublishLog().accepting,
}: { handshakeTimeoutMs?: number; idleTimeoutMs?: number; publish?: PublishGate } = {}) => {
  const messages: RtmpMessage[] = [];
  const errors: unknown[] = [];
  const server = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs,
    idleTimeoutMs,
    limits: { maxChunkSize: 65_536, maxMessageSize: MAX_MESSAGE_SIZE, maxChunkStreams: 8 },
    randomBytes: (size) => new Uint8Array(size).fill(7),
    onMessage: (message) => messages.push(message),
    publish,
    onError: (error) => errors.push(error),
  });
  onTestFinished(() => server.close());
  return { ...server, messages, errors };
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
  socket.write(C2_AND_CHUNKS);
  await waitFor(() => stats().handshakes === 1);
};

const NO_REJECTION = {
  unsupported_version: 0,
  handshake_timeout: 0,
  idle_timeout: 0,
  unknown_chunk_stream: 0,
  message_too_large: 0,
  invalid_chunk_size: 0,
  too_many_chunk_streams: 0,
  malformed_command: 0,
  publish_refused: 0,
  publish_failed: 0,
};

const repliesIn = (received: Buffer) => {
  const step = demuxChunks({
    demuxer: startDemuxer({ maxChunkSize: 128, maxMessageSize: 4096, maxChunkStreams: 4 }),
    input: received.subarray(3073),
  });
  return (step.ok ? step.value.messages : []).map(({ typeId, payload }) => {
    const values = decodeAmf0(payload);
    return typeId === 20 && values.ok ? values.value : typeId;
  });
};

const publishThrough = async (name: string, server: Awaited<ReturnType<typeof startServer>>) => {
  const client = await openClient(server.port);
  client.socket.write(C0C1);
  await waitFor(() => client.received().length >= 3073);
  client.socket.write(ffmpegPublishThrough(name).subarray(1537));
  return client;
};

const command = (values: Parameters<typeof encodeAmf0>[0], streamId = 0) => {
  const payload = encodeAmf0(values);
  return makeChunk({
    fmt: 0,
    chunkStreamId: 3,
    length: payload.length,
    typeId: 20,
    streamId,
    data: payload,
  });
};

const isMedia = ({ typeId }: { typeId: number }) => typeId === 8 || typeId === 9;

describe("serveur RTMP, poignée de main (ADR 0031, §3)", () => {
  it("rejoue la poignée de main de ffmpeg : S0, S1 aléatoire, S2 en écho de C1", async () => {
    const server = await startServer();
    const client = await openClient(server.port);

    await handshakeWith(client.socket, client.received, server.stats);

    const reply = client.received().subarray(0, 3073);
    expect(reply[0]).toBe(3);
    expect(reply.subarray(1, 9)).toEqual(Buffer.alloc(8));
    expect(reply.subarray(9, 1537)).toEqual(Buffer.alloc(1528, 7));
    expect(reply.subarray(1537)).toEqual(Buffer.from(C1));
    expect(server.stats()).toEqual({ connections: 1, handshakes: 1, rejections: NO_REJECTION });
  });

  it("démultiplexe la publication ffmpeg en messages identiques aux tags de son FLV", async () => {
    const server = await startServer();
    const client = await openClient(server.port);

    await handshakeWith(client.socket, client.received, server.stats);
    const expected = FFMPEG_PUBLISH_FLV_TAGS.filter(isMedia);
    await waitFor(() => server.messages.filter(isMedia).length === expected.length);

    expect(
      server.messages
        .filter(isMedia)
        .map(({ typeId, timestamp, payload }) => ({ typeId, timestamp, payload })),
    ).toEqual(expected);
    expect(server.stats().handshakes).toBe(1);
  });

  it("ferme une connexion qui annonce un message trop grand et compte le rejet", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    await handshakeWith(client.socket, client.received, server.stats);

    client.socket.write(
      makeChunk({ fmt: 0, chunkStreamId: 9, length: MAX_MESSAGE_SIZE + 1, typeId: 9, streamId: 1 }),
    );

    expect(await client.closed).toBe(true);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, message_too_large: 1 });
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

  it("garde ouverte une connexion qui envoie des chunks après la poignée de main, et les démultiplexe", async () => {
    const server = await startServer();
    const client = await openClient(server.port);
    await handshakeWith(client.socket, client.received, server.stats);
    const before = server.messages.length;

    for (const _ of Array.from({ length: 6 })) {
      client.socket.write(
        makeChunk({
          fmt: 0,
          chunkStreamId: 4,
          length: 1,
          typeId: 8,
          streamId: 1,
          data: Uint8Array.of(0),
        }),
      );
      await sleep(IDLE_TIMEOUT_MS / 3);
    }

    expect(await client.isClosed()).toBe(false);
    expect(server.messages.slice(before)).toHaveLength(6);
    expect(server.stats()).toMatchObject({ handshakes: 1, rejections: NO_REJECTION });
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

describe("serveur RTMP, commandes et publish (ADR 0031, §3)", () => {
  it("répond à la publication de ffmpeg, la soumet avec sa clé, et la termine à deleteStream", async () => {
    const publications = makePublishLog();
    const server = await startServer({ ...PUBLISH_TIMEOUTS, publish: publications.accepting });
    const client = await publishThrough("deleteStream", server);

    await waitFor(
      () => publications.entries.length === 2 && repliesIn(client.received()).length === 5,
    );

    expect(publications.entries).toEqual([
      `publish ${FFMPEG_STREAM_KEY}`,
      `end ${FFMPEG_STREAM_KEY}`,
    ]);
    expect(repliesIn(client.received())).toEqual([
      5,
      6,
      [
        "_result",
        1,
        expect.anything(),
        expect.objectContaining({ code: "NetConnection.Connect.Success" }),
      ],
      ["_result", 4, null, 1],
      ["onStatus", 0, null, expect.objectContaining({ code: "NetStream.Publish.Start" })],
    ]);
    expect(await client.isClosed()).toBe(false);
    expect(server.stats().rejections).toEqual(NO_REJECTION);
  });

  it("ferme la connexion d'une clé refusée, sans annoncer de publication, et compte le rejet", async () => {
    const server = await startServer({ ...PUBLISH_TIMEOUTS, publish: async () => undefined });
    const client = await publishThrough("publish", server);

    expect(await client.closed).toBe(true);
    expect(repliesIn(client.received()).flat()).not.toContain("onStatus");
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, publish_refused: 1 });
  });

  it("termine la publication d'un client qui coupe brutalement la connexion", async () => {
    const publications = makePublishLog();
    const server = await startServer({ ...PUBLISH_TIMEOUTS, publish: publications.accepting });
    const client = await publishThrough("publish", server);
    await waitFor(() => publications.entries.length === 1);

    client.socket.resetAndDestroy();
    await waitFor(() => publications.entries.length === 2);

    expect(publications.entries).toEqual([
      `publish ${FFMPEG_STREAM_KEY}`,
      `end ${FFMPEG_STREAM_KEY}`,
    ]);
  });

  it("termine une publication accordée après le départ du client", async () => {
    const publications = makePublishLog();
    const asked: Array<() => void> = [];
    const server = await startServer({
      ...PUBLISH_TIMEOUTS,
      publish: async (streamKey) => {
        await new Promise<void>((resolve) => {
          asked.push(resolve);
        });
        return publications.accepting(streamKey);
      },
    });
    const client = await publishThrough("publish", server);
    await waitFor(() => asked.length === 1);
    client.socket.resetAndDestroy();
    await waitFor(() => server.stats().connections === 0);

    asked.forEach((grant) => grant());
    await waitFor(() => publications.entries.length === 2);

    expect(publications.entries).toEqual([
      `publish ${FFMPEG_STREAM_KEY}`,
      `end ${FFMPEG_STREAM_KEY}`,
    ]);
  });

  it("ne lit plus la connexion tant que la clé n'a pas de réponse", async () => {
    const asked: Array<() => void> = [];
    const server = await startServer({
      ...PUBLISH_TIMEOUTS,
      publish: async (streamKey) => {
        await new Promise<void>((resolve) => {
          asked.push(resolve);
        });
        return makePublishLog().accepting(streamKey);
      },
    });
    const client = await publishThrough("publish", server);
    await waitFor(() => asked.length === 1);

    client.socket.write(
      makeChunk({ fmt: 0, chunkStreamId: 9, length: MAX_MESSAGE_SIZE + 1, typeId: 9, streamId: 1 }),
    );
    await sleep(50);
    const whileAsking = server.stats().rejections;
    asked.forEach((grant) => grant());

    expect(whileAsking).toEqual(NO_REJECTION);
    expect(await client.closed).toBe(true);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, message_too_large: 1 });
  });

  it("refuse un second publish sur la même connexion", async () => {
    const publications = makePublishLog();
    const server = await startServer({ ...PUBLISH_TIMEOUTS, publish: publications.accepting });
    const client = await publishThrough("publish", server);
    await waitFor(() => publications.entries.length === 1);

    client.socket.write(command(["publish", 6, null, "autre"], 1));

    expect(await client.closed).toBe(true);
    expect(publications.entries).toEqual([
      `publish ${FFMPEG_STREAM_KEY}`,
      `end ${FFMPEG_STREAM_KEY}`,
    ]);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, publish_refused: 1 });
  });

  it("ferme la connexion sur une commande mal formée et compte le rejet", async () => {
    const server = await startServer(PUBLISH_TIMEOUTS);
    const client = await publishThrough("connect", server);

    await waitFor(() => repliesIn(client.received()).length === 3);
    const before = server.messages.length;

    client.socket.write(
      concatBytes(command(["publish", 5, null, ""], 1), command(["deleteStream", 6, null, 1])),
    );

    expect(await client.closed).toBe(true);
    expect(server.messages.length - before).toBe(1);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, malformed_command: 1 });
  });

  it("ferme la connexion et signale l'erreur quand la vérification de la clé échoue", async () => {
    const failure = new Error("base injoignable");
    const server = await startServer({
      ...PUBLISH_TIMEOUTS,
      publish: async () => {
        throw failure;
      },
    });
    const client = await publishThrough("publish", server);

    expect(await client.closed).toBe(true);
    expect(server.errors).toEqual([failure]);
    expect(server.stats().rejections).toEqual({ ...NO_REJECTION, publish_failed: 1 });
  });

  it("signale l'erreur d'une fin de publication qui échoue", async () => {
    const failure = new Error("base injoignable");
    const server = await startServer({
      ...PUBLISH_TIMEOUTS,
      publish: async () => ({
        end: async () => {
          throw failure;
        },
      }),
    });
    const client = await publishThrough("publish", server);
    await waitFor(() => repliesIn(client.received()).length === 5);

    client.socket.destroy();
    await waitFor(() => server.errors.length === 1);

    expect(server.errors).toEqual([failure]);
  });
});
