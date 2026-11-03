import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import { Pool } from "pg";
import { afterAll, describe, expect, it, onTestFinished } from "vitest";

import { createContextClient } from "@repo/db";
import { StreamEnded } from "@repo/video-contract";

import { createControlPlane } from "../control-plane/control-plane.ts";
import { makeVideoChannel } from "../control-plane/testing/video-store.contract.ts";
import { prismaVideoStore } from "../persistence/prisma-video-store.ts";
import { streamKeyCipher } from "../persistence/stream-key-cipher.ts";
import {
  type Delivery,
  startWebhookReceiver,
  verifySignature,
} from "../webhooks/testing/webhook-receiver.ts";
import { startRelayLoop } from "./relay-loop.ts";
import { relayVideoOutbox } from "./video-outbox-relay.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const WEBHOOK_SECRET = randomBytes(32).toString("hex");
const AFTER_MAX_BACKOFF_MS = 10 * 60 * 1000;

const prisma = createContextClient({ context: "video", env: process.env });
const pool = new Pool({ connectionString: urlOf("DATABASE_URL_OUTBOX_RELAY") });
const store = prismaVideoStore({ prisma, cipher: streamKeyCipher({ key: randomBytes(32) }) });
const seededChannels: string[] = [];

afterAll(async () => {
  await prisma.$executeRaw`
    DELETE FROM video."VideoOutbox" WHERE "payload"->>'channelId' = ANY(${seededChannels})`;
  const ofSeededChannels = { where: { channelId: { in: seededChannels } } };
  await prisma.videoIngestSession.deleteMany(ofSeededChannels);
  await prisma.videoStreamKey.deleteMany(ofSeededChannels);
  await prisma.videoChannel.deleteMany({ where: { id: { in: seededChannels } } });
  await prisma.$disconnect();
  await pool.end();
});

const shiftedClock = (offsetMs: number) => () => new Date(Date.now() + offsetMs);

const seedStoppedLive = async () => {
  const channel = makeVideoChannel();
  seededChannels.push(channel.id);
  await store.saveChannel(channel);
  const sessionId = randomUUID();
  await store.saveSession(
    { state: "live", id: sessionId, channelId: channel.id, startedAt: new Date() },
    [],
  );
  const controlPlane = createControlPlane({
    store,
    ingestUrl: "rtmp://127.0.0.1:1935/live",
    newId: randomUUID,
    randomBytes,
  });
  await controlPlane.stopStream(channel.id, new Date());
  const [row] = await prisma.videoOutbox.findMany({
    where: { payload: { path: ["sessionId"], equals: sessionId } },
  });
  if (row === undefined) {
    throw new Error("aucun événement écrit pour la session arrêtée");
  }
  return { eventId: row.id, sessionId, channelId: channel.id };
};

const eventIdOf = (delivery: Delivery): string =>
  StreamEnded.safeParse(JSON.parse(delivery.body.toString("utf8"))).data?.id ?? "";

const scriptedReceiver = async (eventId: string, statuses: readonly number[]) => {
  const answered: number[] = [];
  const receiver = await startWebhookReceiver({
    respond: (delivery) => {
      if (eventIdOf(delivery) !== eventId) {
        return 503;
      }
      const status = statuses[Math.min(answered.length, statuses.length - 1)] ?? 503;
      answered.push(status);
      return status;
    },
  });
  onTestFinished(() => receiver.close());
  return {
    ...receiver,
    answered,
    ours: () => receiver.deliveries.filter((delivery) => eventIdOf(delivery) === eventId),
  };
};

const rowOf = (id: string) =>
  prisma.videoOutbox.findUniqueOrThrow({
    where: { id },
    select: { attempts: true, lastError: true, publishedAt: true },
  });

const relayWith = ({ url, offsetMs }: { url: string; offsetMs: number }) =>
  relayVideoOutbox({
    pool,
    webhook: { url, secret: WEBHOOK_SECRET },
    now: shiftedClock(offsetMs),
    random: Math.random,
  });

describe("relais de l'outbox vidéo vers l'API (ADR 0031)", () => {
  it("envoie le stream.ended d'un live arrêté, signé, le réémet après un 500 et le marque publié après un 200", async () => {
    const { eventId, sessionId, channelId } = await seedStoppedLive();
    const receiver = await scriptedReceiver(eventId, [500, 200]);

    await relayWith({ url: receiver.url, offsetMs: 0 })();

    expect(await rowOf(eventId)).toMatchObject({
      attempts: 1,
      lastError: "webhook refusé par l'API : 500",
      publishedAt: null,
    });

    await relayWith({ url: receiver.url, offsetMs: AFTER_MAX_BACKOFF_MS })();

    expect((await rowOf(eventId)).publishedAt).not.toBeNull();
    expect(receiver.answered).toEqual([500, 200]);
    const [, accepted] = receiver.ours();
    expect(StreamEnded.parse(JSON.parse(String(accepted?.body)))).toMatchObject({
      id: eventId,
      type: "stream.ended",
      channelId,
      sessionId,
    });
    expect(
      verifySignature({
        secret: WEBHOOK_SECRET,
        body: accepted?.body ?? Buffer.alloc(0),
        signature: String(accepted?.signature),
        now: shiftedClock(AFTER_MAX_BACKOFF_MS)(),
      }),
    ).toBe(true);
  });

  it("ne perd rien quand le relais redémarre avant que l'API accepte l'événement", async () => {
    const { eventId } = await seedStoppedLive();
    const refusing = await scriptedReceiver(eventId, [500]);
    const first = startRelayLoop({
      intervalMs: 10,
      relay: relayWith({ url: refusing.url, offsetMs: 0 }),
      onError: () => {},
    });
    while (refusing.ours().length === 0) {
      await sleep(10);
    }
    await first.stop();
    expect((await rowOf(eventId)).publishedAt).toBeNull();

    const accepting = await scriptedReceiver(eventId, [200]);
    const second = startRelayLoop({
      intervalMs: 10,
      relay: relayWith({ url: accepting.url, offsetMs: AFTER_MAX_BACKOFF_MS }),
      onError: () => {},
    });
    onTestFinished(() => second.stop());
    while (accepting.answered.length === 0) {
      await sleep(10);
    }
    await second.stop();

    expect((await rowOf(eventId)).publishedAt).not.toBeNull();
  });
});
