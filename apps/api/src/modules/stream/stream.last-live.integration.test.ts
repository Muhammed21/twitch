import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createLastLiveReader } from "./stream.module.ts";

const prisma = createContextClient({ context: "stream", env: process.env });
const lastLiveOf = createLastLiveReader(prisma);

const seededSessions: string[] = [];

const seedSession = async ({
  channelId,
  startedAt,
  endedAt,
}: {
  channelId: string;
  startedAt: Date;
  endedAt?: Date;
}) => {
  const id = randomUUID();
  await prisma.streamSession.create({
    data: {
      id,
      channelId,
      providerSessionId: `session-${id}`,
      startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
    },
  });
  seededSessions.push(id);
};

afterAll(async () => {
  await prisma.streamSession.deleteMany({ where: { id: { in: seededSessions } } });
  await prisma.$disconnect();
});

describe("dernier live d'une chaîne", () => {
  it("rend le début de la session la plus récente", async () => {
    const channelId = randomUUID();
    await seedSession({
      channelId,
      startedAt: new Date("2026-11-01T20:00:00.000Z"),
      endedAt: new Date("2026-11-01T22:00:00.000Z"),
    });
    await seedSession({
      channelId,
      startedAt: new Date("2026-11-03T20:15:00.000Z"),
      endedAt: new Date("2026-11-03T21:00:00.000Z"),
    });
    await seedSession({ channelId: randomUUID(), startedAt: new Date("2026-11-04T08:00:00.000Z") });

    expect(await lastLiveOf(channelId)).toEqual(new Date("2026-11-03T20:15:00.000Z"));
  });

  it("compte le live en cours comme le dernier", async () => {
    const channelId = randomUUID();
    await seedSession({
      channelId,
      startedAt: new Date("2026-11-01T20:00:00.000Z"),
      endedAt: new Date("2026-11-01T22:00:00.000Z"),
    });
    await seedSession({ channelId, startedAt: new Date("2026-11-04T08:00:00.000Z") });

    expect(await lastLiveOf(channelId)).toEqual(new Date("2026-11-04T08:00:00.000Z"));
  });

  it("ne rend rien pour une chaîne qui n'a jamais streamé", async () => {
    expect(await lastLiveOf(randomUUID())).toBeUndefined();
  });
});
