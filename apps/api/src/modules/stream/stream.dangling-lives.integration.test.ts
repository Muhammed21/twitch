import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { endDanglingLives } from "./application/end-dangling-lives.ts";
import { prismaDanglingLives } from "./infrastructure/prisma-dangling-lives.ts";

const prisma = createContextClient({ context: "stream", env: process.env });
const lives = prismaDanglingLives(prisma);

const NOW = new Date("2026-11-06T08:00:00.000Z");
const STARTED_AT = new Date("2026-11-04T11:23:36.513Z");
const ENDED_AT = new Date("2026-11-04T12:00:00.000Z");

const seededSessions: string[] = [];
const seededEvents: string[] = [];

const seedSession = async ({ endedAt }: { endedAt?: Date } = {}) => {
  const id = randomUUID();
  const channelId = randomUUID();
  await prisma.streamSession.create({
    data: {
      id,
      channelId,
      providerSessionId: `session-${id}`,
      startedAt: STARTED_AT,
      ...(endedAt === undefined ? {} : { endedAt }),
    },
  });
  seededSessions.push(id);
  return { sessionId: id, channelId };
};

const seedEvent = async ({
  name,
  sessionId,
  channelId,
}: {
  name: "stream.started" | "stream.ended";
  sessionId: string;
  channelId: string;
}) => {
  const id = randomUUID();
  const payload =
    name === "stream.started"
      ? { sessionId, channelId, startedAt: STARTED_AT.toISOString() }
      : { sessionId, channelId, endedAt: ENDED_AT.toISOString() };
  await prisma.$executeRaw`
    INSERT INTO "stream"."StreamOutbox" ("id", "name", "version", "payload", "occurredAt")
    VALUES (${id}::uuid, ${name}, 1, ${JSON.stringify(payload)}::jsonb, ${STARTED_AT})
  `;
  seededEvents.push(id);
};

const endedEventsOf = async (sessionId: string) =>
  (
    await prisma.$queryRaw<{ payload: unknown }[]>`
      SELECT "payload" FROM "stream"."StreamOutbox"
       WHERE "name" = 'stream.ended' AND "payload"->>'sessionId' = ${sessionId}
    `
  ).map(({ payload }) => payload);

const endedAtOf = async (sessionId: string) =>
  (await prisma.streamSession.findUnique({ where: { id: sessionId }, select: { endedAt: true } }))
    ?.endedAt;

const endAll = endDanglingLives({ lives, now: () => NOW, newId: randomUUID });

afterAll(async () => {
  await prisma.$executeRaw`
    DELETE FROM "stream"."StreamOutbox"
     WHERE "id" = ANY(${seededEvents}::uuid[])
        OR ("name" = 'stream.ended' AND "payload"->>'sessionId' = ANY(${seededSessions}))
  `;
  await prisma.streamSession.deleteMany({ where: { id: { in: seededSessions } } });
  await prisma.$disconnect();
});

describe("lives restés ouverts sur une pile de développement", () => {
  it("clôt une session restée ouverte et publie son stream.ended", async () => {
    const { sessionId, channelId } = await seedSession();
    await seedEvent({ name: "stream.started", sessionId, channelId });

    const ended = await endAll();

    expect(ended).toContainEqual({ sessionId, channelId, startedAt: STARTED_AT });
    expect(await endedAtOf(sessionId)).toEqual(NOW);
    expect(await endedEventsOf(sessionId)).toEqual([
      { sessionId, channelId, endedAt: NOW.toISOString() },
    ]);
  });

  it("publie le stream.ended d'un live annoncé dont la session n'existe pas", async () => {
    const sessionId = randomUUID();
    const channelId = randomUUID();
    await seedEvent({ name: "stream.started", sessionId, channelId });

    expect(await endAll()).toContainEqual({ sessionId, channelId, startedAt: STARTED_AT });
    expect(await endedEventsOf(sessionId)).toEqual([
      { sessionId, channelId, endedAt: NOW.toISOString() },
    ]);
  });

  it("publie le stream.ended d'une session close sans fin annoncée, sans changer sa fin", async () => {
    const { sessionId, channelId } = await seedSession({ endedAt: ENDED_AT });
    await seedEvent({ name: "stream.started", sessionId, channelId });

    await endAll();

    expect(await endedAtOf(sessionId)).toEqual(ENDED_AT);
    expect(await endedEventsOf(sessionId)).toEqual([
      { sessionId, channelId, endedAt: NOW.toISOString() },
    ]);
  });

  it("termine un live dont la seule fin annoncée porte sur une autre chaîne", async () => {
    const sessionId = randomUUID();
    const channelId = randomUUID();
    await seedEvent({ name: "stream.started", sessionId, channelId });
    await seedEvent({ name: "stream.ended", sessionId, channelId: randomUUID() });

    expect(await endAll()).toContainEqual({ sessionId, channelId, startedAt: STARTED_AT });
  });

  it("passe un stream.started dont le payload ne nomme pas la session", async () => {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "stream"."StreamOutbox" ("id", "name", "version", "payload", "occurredAt")
      VALUES (${id}::uuid, 'stream.started', 1, '{}'::jsonb, ${STARTED_AT})
    `;
    seededEvents.push(id);

    const ended = await endAll();

    expect(ended.every(({ sessionId }) => typeof sessionId === "string")).toBe(true);
  });

  it("laisse un live déjà terminé, et ne termine rien deux fois", async () => {
    const { sessionId, channelId } = await seedSession({ endedAt: ENDED_AT });
    await seedEvent({ name: "stream.started", sessionId, channelId });
    await seedEvent({ name: "stream.ended", sessionId, channelId });
    const open = await seedSession();

    const first = await endAll();
    const again = await endAll();

    expect(first.map((live) => live.sessionId)).not.toContain(sessionId);
    expect(again.map((live) => live.sessionId)).not.toContain(open.sessionId);
    expect(await endedEventsOf(sessionId)).toEqual([
      { sessionId, channelId, endedAt: ENDED_AT.toISOString() },
    ]);
    expect(await endedEventsOf(open.sessionId)).toHaveLength(1);
  });
});
