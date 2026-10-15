import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import type { LiveSession } from "./application/live-video-provider.ts";
import { reconcileStreamSessions } from "./application/reconcile-stream-sessions.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import {
  prismaOpenStreamSessions,
  prismaStreamSessions,
} from "./infrastructure/prisma-stream-sessions.ts";
import { reconciliationEndEventId } from "./infrastructure/reconciliation-end-event-id.ts";

const prisma = createContextClient({ context: "stream", env: process.env });

const record = recordStreamLifecycle({ sessions: prismaStreamSessions(prisma), newId: randomUUID });

const openSessions = prismaOpenStreamSessions({ prisma });

const at = (time: string) => new Date(`2026-10-15T${time}:00.000Z`);

const seedChannel = async () => {
  const channel = { channelId: randomUUID(), providerChannelId: `provider-${randomUUID()}` };
  await prisma.streamChannel.create({ data: channel });
  return channel;
};

const seedLiveSession = async (channel: { providerChannelId: string }) => {
  const providerSessionId = `session-${randomUUID()}`;
  await record({
    eventId: randomUUID(),
    kind: "started",
    providerChannelId: channel.providerChannelId,
    providerSessionId,
    occurredAt: at("20:00"),
  });
  return providerSessionId;
};

const providerForgetting = (forgotten: string) => ({
  listLiveSessions: async (): Promise<readonly LiveSession[]> =>
    (await openSessions.list())
      .filter(({ providerSessionId }) => providerSessionId !== forgotten)
      .map(({ providerSessionId }) => ({ providerSessionId })),
});

const reconcileWith = (provider: ReturnType<typeof providerForgetting>) =>
  reconcileStreamSessions({
    provider,
    openSessions,
    record,
    endEventIdOf: reconciliationEndEventId,
  });

const endedEventsOf = async (channelId: string) =>
  (await prisma.streamOutbox.findMany({ where: { name: "stream.ended" }, take: 10_000 }))
    .filter(
      (row) =>
        typeof row.payload === "object" &&
        row.payload !== null &&
        "channelId" in row.payload &&
        row.payload.channelId === channelId,
    )
    .map(({ payload, occurredAt }) => ({ payload, occurredAt }));

afterAll(async () => {
  await prisma.$disconnect();
});

describe("réconciliation des sessions avec le provider, en base (ADR 0001, 0031)", () => {
  it("clôt une session ouverte que le provider ne connaît plus, avec stream.ended, une seule fois", async () => {
    const channel = await seedChannel();
    const forgotten = await seedLiveSession(channel);
    const reconcile = reconcileWith(providerForgetting(forgotten));

    expect(await reconcile(at("21:00"))).toEqual({ closed: [forgotten] });
    expect(await reconcile(at("21:01"))).toEqual({ closed: [] });

    const session = await prisma.streamSession.findUnique({
      where: { providerSessionId: forgotten },
    });
    expect(session).toMatchObject({ startedAt: at("20:00"), endedAt: at("21:00") });
    expect(await endedEventsOf(channel.channelId)).toEqual([
      {
        payload: {
          sessionId: session?.id,
          channelId: channel.channelId,
          endedAt: "2026-10-15T21:00:00.000Z",
        },
        occurredAt: at("21:00"),
      },
    ]);
  });

  it("ne publie qu'un stream.ended quand deux instances réconcilient la même session en même temps", async () => {
    const channel = await seedChannel();
    const forgotten = await seedLiveSession(channel);
    const provider = providerForgetting(forgotten);
    const barrier = { count: 0, release: () => {} };
    const bothListed = new Promise<void>((resolve) => {
      barrier.release = resolve;
    });
    const listingTogether = {
      list: async () => {
        const open = await openSessions.list();
        barrier.count += 1;
        if (barrier.count === 2) barrier.release();
        await bothListed;
        return open;
      },
    };
    const instance = () =>
      reconcileStreamSessions({
        provider,
        openSessions: listingTogether,
        record,
        endEventIdOf: reconciliationEndEventId,
      });

    await Promise.all([instance()(at("21:00")), instance()(at("21:00"))]);

    expect(await endedEventsOf(channel.channelId)).toHaveLength(1);
  });

  it("ne compte pas comme close une session dont le webhook de fin arrive pendant la réconciliation", async () => {
    const channel = await seedChannel();
    const forgotten = await seedLiveSession(channel);
    const endedByWebhook = {
      list: async () => {
        const open = await openSessions.list();
        await record({
          eventId: randomUUID(),
          kind: "ended",
          providerChannelId: channel.providerChannelId,
          providerSessionId: forgotten,
          occurredAt: at("20:59"),
        });
        return open;
      },
    };
    const reconcile = reconcileStreamSessions({
      provider: providerForgetting(forgotten),
      openSessions: endedByWebhook,
      record,
      endEventIdOf: reconciliationEndEventId,
    });

    expect((await reconcile(at("21:00"))).closed).not.toContain(forgotten);
    expect(await endedEventsOf(channel.channelId)).toHaveLength(1);
  });

  it("laisse ouverte une session que le provider diffuse encore", async () => {
    const channel = await seedChannel();
    const live = await seedLiveSession(channel);
    const reconcile = reconcileWith(providerForgetting(`autre-${randomUUID()}`));

    expect((await reconcile(at("21:00"))).closed).not.toContain(live);
    expect(
      await prisma.streamSession.findUnique({ where: { providerSessionId: live } }),
    ).toMatchObject({ endedAt: null });
  });

  it("lit les sessions ouvertes page par page, chacune une fois avec son canal provider, sans les sessions closes", async () => {
    const seedOpen = async () => {
      const channel = await seedChannel();
      return {
        providerSessionId: await seedLiveSession(channel),
        providerChannelId: channel.providerChannelId,
        startedAt: at("20:00"),
      };
    };
    const [closed, ...open] = await Promise.all([seedOpen(), seedOpen(), seedOpen()]);
    await record({
      eventId: randomUUID(),
      kind: "ended",
      providerChannelId: closed.providerChannelId,
      providerSessionId: closed.providerSessionId,
      occurredAt: at("20:30"),
    });
    const bySession = (a: { providerSessionId: string }, b: { providerSessionId: string }) =>
      a.providerSessionId.localeCompare(b.providerSessionId);
    const seeded = new Set([closed, ...open].map(({ providerSessionId }) => providerSessionId));

    const listed = await prismaOpenStreamSessions({ prisma, pageSize: 2 }).list();

    expect(
      listed.filter(({ providerSessionId }) => seeded.has(providerSessionId)).toSorted(bySession),
    ).toEqual(open.toSorted(bySession));
    expect(new Set(listed.map(({ providerSessionId }) => providerSessionId)).size).toBe(
      listed.length,
    );
  });

  it("écarte une session ouverte dont la chaîne n'a pas de canal provider", async () => {
    const providerSessionId = `session-${randomUUID()}`;
    await prisma.streamSession.create({
      data: {
        id: randomUUID(),
        channelId: randomUUID(),
        providerSessionId,
        startedAt: at("20:00"),
      },
    });

    expect((await openSessions.list()).map((session) => session.providerSessionId)).not.toContain(
      providerSessionId,
    );
  });
});
