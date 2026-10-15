import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createAuthzRedis } from "../../authz/authz-context.ts";
import { createChannelForAccount } from "./application/create-channel-for-account.ts";
import { slugCandidates } from "./domain/channel-slug.ts";
import { prismaChannelRegistry } from "./infrastructure/prisma-channel-registry.ts";
import { redisOwnerAssignmentsCache } from "./infrastructure/redis-owner-assignments-cache.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const NOW = new Date("2026-10-15T10:00:00.000Z");

const prisma = createContextClient({ context: "channel", env: process.env });
const redis = createAuthzRedis(urlOf("REDIS_URL"));

const handle = createChannelForAccount({
  registry: prismaChannelRegistry(prisma),
  cache: redisOwnerAssignmentsCache(redis),
  newId: randomUUID,
  now: () => NOW,
});

const uniqueName = () => `Streamer ${randomUUID().slice(0, 8)}`;

const makeRegistration = (overrides: { accountId?: string; displayName?: string } = {}) => ({
  eventId: randomUUID(),
  accountId: randomUUID(),
  displayName: uniqueName(),
  ...overrides,
});

const channelsOf = (ownerId: string) => prisma.channel.findMany({ where: { ownerId } });

const outboxOf = async (ownerId: string) =>
  (await prisma.channelOutbox.findMany({ orderBy: { occurredAt: "asc" } })).filter(
    (row) =>
      typeof row.payload === "object" &&
      row.payload !== null &&
      "ownerId" in row.payload &&
      row.payload.ownerId === ownerId,
  );

beforeAll(async () => {
  await redis.connect();
});

afterAll(async () => {
  redis.destroy();
  await prisma.$disconnect();
});

describe("chaîne créée à l'inscription (ADR 0003, ADR 0035)", () => {
  it("crée la chaîne, l'attribution owner et channel.created dans l'outbox", async () => {
    const suffix = randomUUID().slice(0, 8);
    const registration = makeRegistration({ displayName: `Élodie Café ${suffix}` });
    const expectedSlug = `elodie_cafe_${suffix}`;

    const outcome = await handle(registration);

    const [channel] = await channelsOf(registration.accountId);
    expect(outcome).toEqual({ status: "created", slug: expectedSlug, cacheInvalidated: true });
    expect(channel).toMatchObject({
      ownerId: registration.accountId,
      slug: expectedSlug,
      title: "",
    });
    expect(
      await prisma.authzRoleAssignment.findMany({
        where: { subjectId: registration.accountId },
        select: { role: true, scopeType: true, scopeId: true, grantedBy: true, revokedAt: true },
      }),
    ).toEqual([
      {
        role: "owner",
        scopeType: "channel",
        scopeId: channel?.id,
        grantedBy: "svc:channel-registration",
        revokedAt: null,
      },
    ]);
    expect(await outboxOf(registration.accountId)).toEqual([
      expect.objectContaining({
        name: "channel.created",
        version: 1,
        payload: { channelId: channel?.id, ownerId: registration.accountId, slug: expectedSlug },
        occurredAt: NOW,
        publishedAt: null,
      }),
    ]);
  });

  it("enregistre l'event traité sous son handler", async () => {
    const registration = makeRegistration();

    await handle(registration);

    expect(
      await prisma.channelProcessedEvent.findMany({
        where: { eventId: registration.eventId },
        select: { handlerName: true },
      }),
    ).toEqual([{ handlerName: "channel.create-on-registration" }]);
  });

  it("ne crée qu'une chaîne quand l'event est rejoué", async () => {
    const registration = makeRegistration();

    await handle(registration);
    const replay = await handle(registration);

    expect(replay).toEqual({ status: "already-processed" });
    expect(await channelsOf(registration.accountId)).toHaveLength(1);
    expect(await outboxOf(registration.accountId)).toHaveLength(1);
  });

  it("ne crée pas de seconde chaîne pour un compte qui en a déjà une", async () => {
    const accountId = randomUUID();

    await handle(makeRegistration({ accountId }));
    const second = await handle(makeRegistration({ accountId }));

    expect(second).toEqual({ status: "already-processed" });
    expect(await channelsOf(accountId)).toHaveLength(1);
    expect(await outboxOf(accountId)).toHaveLength(1);
  });

  it("prend le candidat suivant quand le slug est pris", async () => {
    const displayName = uniqueName();
    const first = await handle(makeRegistration({ displayName }));

    const second = await handle(makeRegistration({ displayName }));

    expect(first).toMatchObject({ status: "created" });
    expect(second).toMatchObject({
      status: "created",
      slug: `${first.status === "created" ? first.slug : ""}_2`,
    });
  });

  it("échoue sans rien écrire quand tous les candidats sont pris, pour que l'event se retente", async () => {
    const registration = makeRegistration();
    await prisma.channel.createMany({
      data: slugCandidates(registration).map((slug) => ({
        id: randomUUID(),
        ownerId: randomUUID(),
        slug,
      })),
    });

    await expect(handle(registration)).rejects.toThrow(
      new Error(`aucun slug libre pour le compte ${registration.accountId}`),
    );

    expect(await channelsOf(registration.accountId)).toEqual([]);
    expect(
      await prisma.channelProcessedEvent.findMany({ where: { eventId: registration.eventId } }),
    ).toEqual([]);
  });

  it("invalide le cache des attributions du propriétaire", async () => {
    const registration = makeRegistration();
    await redis.set(`authz:assign:${registration.accountId}`, "[]");

    await handle(registration);

    expect(await redis.exists(`authz:assign:${registration.accountId}`)).toBe(0);
    expect(await redis.get(`authz:gen:${registration.accountId}`)).toBe("1");
  });
});
