import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import {
  type ProviderLifecycleEvent,
  recordStreamLifecycle,
} from "./application/record-stream-lifecycle.ts";
import { prismaStreamSessions } from "./infrastructure/prisma-stream-sessions.ts";

const prisma = createContextClient({ context: "stream", env: process.env });

const record = recordStreamLifecycle({ sessions: prismaStreamSessions(prisma), newId: randomUUID });

const at = (time: string) => new Date(`2026-10-15T${time}:00.000Z`);

const seedChannel = async () => {
  const channel = { channelId: randomUUID(), providerChannelId: `provider-${randomUUID()}` };
  await prisma.streamChannel.create({ data: channel });
  return channel;
};

const lifecycle = (
  channel: { providerChannelId: string },
  overrides: Partial<ProviderLifecycleEvent> = {},
): ProviderLifecycleEvent => ({
  eventId: randomUUID(),
  kind: "started",
  providerChannelId: channel.providerChannelId,
  providerSessionId: `session-${randomUUID()}`,
  occurredAt: at("20:00"),
  ...overrides,
});

const sessionsOf = (channelId: string) =>
  prisma.streamSession.findMany({ where: { channelId }, orderBy: { startedAt: "asc" } });

const outboxOf = async (channelId: string) =>
  (await prisma.streamOutbox.findMany({ orderBy: { occurredAt: "asc" } }))
    .filter(
      (row) =>
        typeof row.payload === "object" &&
        row.payload !== null &&
        "channelId" in row.payload &&
        row.payload.channelId === channelId,
    )
    .map(({ name, version, payload, occurredAt, publishedAt }) => ({
      name,
      version,
      payload,
      occurredAt,
      publishedAt,
    }));

afterAll(async () => {
  await prisma.$disconnect();
});

describe("sessions de diffusion en base (ADR 0001)", () => {
  it("ouvre une session au démarrage et écrit stream.started dans l'outbox", async () => {
    const channel = await seedChannel();
    const event = lifecycle(channel);

    expect(await record(event)).toEqual({ status: "recorded" });

    const [session] = await sessionsOf(channel.channelId);
    expect(session).toMatchObject({
      providerSessionId: event.providerSessionId,
      startedAt: at("20:00"),
      endedAt: null,
    });
    expect(await outboxOf(channel.channelId)).toEqual([
      {
        name: "stream.started",
        version: 1,
        payload: {
          sessionId: session?.id,
          channelId: channel.channelId,
          startedAt: "2026-10-15T20:00:00.000Z",
        },
        occurredAt: at("20:00"),
        publishedAt: null,
      },
    ]);
  });

  it("enregistre l'event traité sous son handler", async () => {
    const event = lifecycle(await seedChannel());

    await record(event);

    expect(
      await prisma.streamProcessedEvent.findMany({
        where: { eventId: event.eventId },
        select: { handlerName: true },
      }),
    ).toEqual([{ handlerName: "stream.record-lifecycle" }]);
  });

  it("n'ouvre qu'une session quand stream.started est rejoué, sous le même identifiant ou un autre", async () => {
    const channel = await seedChannel();
    const event = lifecycle(channel);

    await record(event);
    const replay = await record(event);
    await record({ ...event, eventId: randomUUID() });

    expect(replay).toEqual({ status: "already-processed" });
    expect(await sessionsOf(channel.channelId)).toHaveLength(1);
    expect(await outboxOf(channel.channelId)).toHaveLength(1);
  });

  it("clôt la session à la fin et écrit stream.ended", async () => {
    const channel = await seedChannel();
    const start = lifecycle(channel);
    await record(start);

    await record(
      lifecycle(channel, {
        kind: "ended",
        providerSessionId: start.providerSessionId,
        occurredAt: at("22:00"),
      }),
    );

    const [session] = await sessionsOf(channel.channelId);
    expect(session).toMatchObject({ endedAt: at("22:00") });
    expect((await outboxOf(channel.channelId)).at(-1)).toEqual({
      name: "stream.ended",
      version: 1,
      payload: {
        sessionId: session?.id,
        channelId: channel.channelId,
        endedAt: "2026-10-15T22:00:00.000Z",
      },
      occurredAt: at("22:00"),
      publishedAt: null,
    });
  });

  it("clôt la session restée ouverte quand un nouveau live démarre", async () => {
    const channel = await seedChannel();
    await record(lifecycle(channel));

    await record(lifecycle(channel, { occurredAt: at("21:00") }));

    const sessions = await sessionsOf(channel.channelId);
    expect(sessions.map(({ startedAt, endedAt }) => ({ startedAt, endedAt }))).toEqual([
      { startedAt: at("20:00"), endedAt: at("21:00") },
      { startedAt: at("21:00"), endedAt: null },
    ]);
    expect(
      (await outboxOf(channel.channelId)).map(({ name, occurredAt }) => ({ name, occurredAt })),
    ).toEqual(
      expect.arrayContaining([
        { name: "stream.started", occurredAt: at("20:00") },
        { name: "stream.ended", occurredAt: at("21:00") },
        { name: "stream.started", occurredAt: at("21:00") },
      ]),
    );
    expect(await outboxOf(channel.channelId)).toHaveLength(3);
  });

  it("archive close et sans event un démarrage reçu après le live suivant", async () => {
    const channel = await seedChannel();
    await record(lifecycle(channel, { occurredAt: at("20:00") }));

    await record(lifecycle(channel, { occurredAt: at("19:00") }));

    const sessions = await sessionsOf(channel.channelId);
    expect(sessions.map(({ startedAt, endedAt }) => ({ startedAt, endedAt }))).toEqual([
      { startedAt: at("19:00"), endedAt: at("20:00") },
      { startedAt: at("20:00"), endedAt: null },
    ]);
    expect((await outboxOf(channel.channelId)).map(({ name }) => name)).toEqual(["stream.started"]);
  });

  it("archive un démarrage tardif jusqu'au début de la session la plus proche qui le suit", async () => {
    const channel = await seedChannel();
    await record(lifecycle(channel, { occurredAt: at("21:00") }));
    await record(lifecycle(channel, { occurredAt: at("20:00") }));

    await record(lifecycle(channel, { occurredAt: at("19:00") }));

    expect((await sessionsOf(channel.channelId))[0]).toMatchObject({
      startedAt: at("19:00"),
      endedAt: at("20:00"),
    });
  });

  it("refuse une fin reçue avant son démarrage, puis l'applique quand elle revient", async () => {
    const channel = await seedChannel();
    const start = lifecycle(channel);
    const end = lifecycle(channel, {
      kind: "ended",
      providerSessionId: start.providerSessionId,
      occurredAt: at("22:00"),
    });

    expect(await record(end)).toEqual({ status: "not-yet-started" });
    expect(await prisma.streamProcessedEvent.findMany({ where: { eventId: end.eventId } })).toEqual(
      [],
    );
    await record(start);
    expect(await record(end)).toEqual({ status: "recorded" });

    expect(await sessionsOf(channel.channelId)).toEqual([
      expect.objectContaining({ startedAt: at("20:00"), endedAt: at("22:00") }),
    ]);
  });

  it("n'écrit rien pour un canal provider inconnu", async () => {
    const event = lifecycle({ providerChannelId: `inconnu-${randomUUID()}` });

    expect(await record(event)).toEqual({ status: "unknown-channel" });
    expect(
      await prisma.streamSession.findMany({
        where: { providerSessionId: event.providerSessionId },
      }),
    ).toEqual([]);
  });

  it("refuse en base une seconde session ouverte sur la même chaîne", async () => {
    const channel = await seedChannel();
    await record(lifecycle(channel));

    await expect(
      prisma.streamSession.create({
        data: {
          id: randomUUID(),
          channelId: channel.channelId,
          providerSessionId: `session-${randomUUID()}`,
          startedAt: at("21:00"),
        },
      }),
    ).rejects.toThrow("StreamSession_channelId_open_key");
  });
});
