import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import type { VideoStore } from "../control-plane/control-plane.ts";
import {
  makeVideoChannel,
  describeVideoStoreContract,
} from "../control-plane/testing/video-store.contract.ts";
import { prismaVideoStore } from "./prisma-video-store.ts";
import { streamKeyCipher } from "./stream-key-cipher.ts";

const prisma = createContextClient({ context: "video", env: process.env });

const cipher = streamKeyCipher({ key: randomBytes(32) });

const savedChannels: string[] = [];

const store = (): VideoStore => {
  const prismaStore = prismaVideoStore({ prisma, cipher });
  return {
    ...prismaStore,
    saveChannel: async (channel) => {
      savedChannels.push(channel.id);
      await prismaStore.saveChannel(channel);
    },
  };
};

afterAll(async () => {
  const ofSavedChannels = { where: { channelId: { in: savedChannels } } };
  await prisma.videoIngestSession.deleteMany(ofSavedChannels);
  await prisma.videoStreamKey.deleteMany(ofSavedChannels);
  await prisma.videoChannel.deleteMany({ where: { id: { in: savedChannels } } });
  await prisma.$disconnect();
});

describeVideoStoreContract({ name: "Prisma, schéma video", store });

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");
const ENDED_AT = new Date("2026-11-03T21:00:00.000Z");

describe("clés de stream chiffrées dans le schéma video (ADR 0031)", () => {
  it("ne laisse ni la clé ni son hexadécimal en base, et garde la version de la clé de chiffrement", async () => {
    const channel = makeVideoChannel();
    await store().saveChannel(channel);

    const [row] = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM video."VideoStreamKey" WHERE "channelId" = ${channel.id}::uuid`;
    const stored = JSON.stringify(row, (_, value: unknown) =>
      value instanceof Uint8Array ? Buffer.from(value).toString("hex") : value,
    );

    expect(row).toMatchObject({ encryptionKeyVersion: 1 });
    expect(stored).not.toContain(channel.streamKey);
    expect(stored).not.toContain(channel.streamKey.replace("sk_live_", ""));
  });

  it("ne relit pas une clé avec une autre clé de chiffrement", async () => {
    const channel = makeVideoChannel();
    await store().saveChannel(channel);
    const otherStore = prismaVideoStore({
      prisma,
      cipher: streamKeyCipher({ key: randomBytes(32) }),
    });

    await expect(otherStore.findChannel(channel.id)).rejects.toThrow(/clé de stream illisible/);
  });
});

describe("sessions d'ingest dans le schéma video", () => {
  it("garde le début et la fin d'une session terminée", async () => {
    const channel = makeVideoChannel();
    await store().saveChannel(channel);
    const id = randomUUID();
    await store().saveSession({ state: "live", id, channelId: channel.id, startedAt: STARTED_AT });

    await store().saveSession({
      state: "ended",
      id,
      channelId: channel.id,
      startedAt: STARTED_AT,
      endedAt: ENDED_AT,
    });

    expect(
      await prisma.videoIngestSession.findUnique({
        where: { id },
        select: { state: true, startedAt: true, endedAt: true },
      }),
    ).toEqual({ state: "ended", startedAt: STARTED_AT, endedAt: ENDED_AT });
  });

  it.each([
    ["live sans début", { state: "live" as const, startedAt: null, endedAt: null }],
    ["ended sans fin", { state: "ended" as const, startedAt: STARTED_AT, endedAt: null }],
    ["idle avec un début", { state: "idle" as const, startedAt: STARTED_AT, endedAt: null }],
  ])("refuse une session %s", async (_, dates) => {
    const channel = makeVideoChannel();
    await store().saveChannel(channel);

    await expect(
      prisma.videoIngestSession.create({
        data: { id: randomUUID(), channelId: channel.id, ...dates },
      }),
    ).rejects.toThrow(/VideoIngestSession_dates_by_state_check|check constraint/i);
  });

  it("liste les sessions live de toutes les pages", async () => {
    const channels = [makeVideoChannel(), makeVideoChannel(), makeVideoChannel()];
    await Promise.all(channels.map((channel) => store().saveChannel(channel)));
    const sessions = channels.map(({ id }) => ({
      state: "live" as const,
      id: randomUUID(),
      channelId: id,
      startedAt: STARTED_AT,
    }));
    await Promise.all(sessions.map((session) => store().saveSession(session)));

    const listed = await prismaVideoStore({
      prisma,
      cipher,
      liveSessionsPageSize: 2,
    }).liveSessions();

    expect(listed).toEqual(expect.arrayContaining(sessions));
    expect(new Set(listed.map(({ id }) => id)).size).toBe(listed.length);
  });

  it("refuse une seconde session live sur un même canal", async () => {
    const channel = makeVideoChannel();
    await store().saveChannel(channel);
    await store().saveSession({
      state: "live",
      id: randomUUID(),
      channelId: channel.id,
      startedAt: STARTED_AT,
    });

    await expect(
      store().saveSession({
        state: "live",
        id: randomUUID(),
        channelId: channel.id,
        startedAt: STARTED_AT,
      }),
    ).rejects.toThrow(/Unique constraint|unique/i);
  });
});
