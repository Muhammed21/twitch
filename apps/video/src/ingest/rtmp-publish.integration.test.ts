import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";

import { createContextClient } from "@repo/db";
import { StreamEnded, StreamStarted } from "@repo/video-contract";

import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { prismaVideoStore } from "../persistence/prisma-video-store.ts";
import { streamKeyCipher } from "../persistence/stream-key-cipher.ts";
import { startRtmpServer } from "../rtmp/rtmp-server.ts";
import { publishWith, waitFor } from "../rtmp/testing/rtmp-client.ts";
import { createPublishGate } from "./publish-gate.ts";

const prisma = createContextClient({ context: "video", env: process.env });
const store = prismaVideoStore({ prisma, cipher: streamKeyCipher({ key: randomBytes(32) }) });
const savedChannels: string[] = [];

const LifecycleEvent = z.union([StreamStarted, StreamEnded]);

afterAll(async () => {
  await prisma.$executeRaw`
    DELETE FROM video."VideoOutbox" WHERE "payload"->>'channelId' = ANY(${savedChannels})`;
  await prisma.videoIngestSession.deleteMany({ where: { channelId: { in: savedChannels } } });
  await prisma.videoStreamKey.deleteMany({ where: { channelId: { in: savedChannels } } });
  await prisma.videoChannel.deleteMany({ where: { id: { in: savedChannels } } });
  await prisma.$disconnect();
});

const seedChannel = async () => {
  const channel = makeVideoChannel();
  savedChannels.push(channel.id);
  await store.saveChannel(channel);
  return channel;
};

const outboxTypesOf = async (channelId: string) =>
  (
    await prisma.videoOutbox.findMany({
      where: { payload: { path: ["channelId"], equals: channelId } },
      orderBy: { occurredAt: "asc" },
    })
  ).map(({ payload }) => LifecycleEvent.parse(payload).type);

const startIngest = async () => {
  const server = await startRtmpServer({
    port: 0,
    handshakeTimeoutMs: 2000,
    idleTimeoutMs: 5000,
    limits: { maxChunkSize: 65_536, maxMessageSize: 65_536, maxChunkStreams: 16 },
    randomBytes,
    onMessage: () => undefined,
    publish: createPublishGate({ store, newId: randomUUID, now: () => new Date() }),
    onError: () => undefined,
  });
  onTestFinished(() => server.close());
  return server;
};

describe("ingest RTMP sur le dépôt Prisma (ADR 0031, §3)", () => {
  it("ouvre la session sur la clé du canal, écrit stream.started puis stream.ended à la coupure", async () => {
    const channel = await seedChannel();
    const server = await startIngest();

    const publisher = await publishWith(server.port, channel.streamKey);
    await waitFor(async () => (await outboxTypesOf(channel.id)).length === 1);
    expect(await outboxTypesOf(channel.id)).toEqual(["stream.started"]);
    expect(await publisher.isClosed()).toBe(false);

    publisher.socket.resetAndDestroy();
    await waitFor(async () => (await outboxTypesOf(channel.id)).length === 2);

    expect(await outboxTypesOf(channel.id)).toEqual(["stream.started", "stream.ended"]);
  });

  it("ferme la connexion d'une clé qui n'est celle d'aucun canal, sans rien écrire", async () => {
    const channel = await seedChannel();
    const server = await startIngest();

    const publisher = await publishWith(server.port, `${channel.streamKey.slice(0, -1)}x`);

    expect(await publisher.closed).toBe(true);
    expect(await outboxTypesOf(channel.id)).toEqual([]);
  });

  it("refuse un second publisher sur un canal déjà en direct", async () => {
    const channel = await seedChannel();
    const server = await startIngest();
    const first = await publishWith(server.port, channel.streamKey);
    await waitFor(async () => (await outboxTypesOf(channel.id)).length === 1);

    const second = await publishWith(server.port, channel.streamKey);

    expect(await second.closed).toBe(true);
    expect(await first.isClosed()).toBe(false);
    expect(await outboxTypesOf(channel.id)).toEqual(["stream.started"]);
  });
});
