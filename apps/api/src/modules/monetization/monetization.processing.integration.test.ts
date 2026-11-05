import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { processWebhook, type WebhookSkip } from "./application/process-webhook.ts";
import { prismaWebhookQueue } from "./infrastructure/prisma-webhook-queue.ts";
import { TURBO_ENTITLEMENT, translateRevenueCatEvent } from "./infrastructure/revenuecat-events.ts";

const PROVIDER = `revenuecat-test-${randomUUID()}`;

const prisma = createContextClient({ context: "monetization", env: process.env });

const queue = prismaWebhookQueue({ prisma, provider: PROVIDER, backoff: () => 60_000 });

const alerts: WebhookSkip[] = [];

const work = processWebhook({
  translate: translateRevenueCatEvent,
  newId: randomUUID,
  alert: (skip) => {
    alerts.push(skip);
  },
});

const seededUsers: string[] = [];

const newUser = () => {
  const userId = randomUUID();
  seededUsers.push(userId);
  return userId;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const START_MS = Date.UTC(2026, 10, 8, 9);

const at = (day: number) => START_MS + day * DAY_MS;

const seedWebhook = async (event: Record<string, unknown>) => {
  const eventId = randomUUID();
  await prisma.monetizationProcessedWebhookEvent.create({
    data: {
      provider: PROVIDER,
      eventId,
      payload: {
        api_version: "1.0",
        event: {
          id: eventId,
          entitlement_ids: [TURBO_ENTITLEMENT],
          original_transaction_id: "2000000123456789",
          ...event,
        },
      },
    },
  });
  return eventId;
};

const processAll = async (): Promise<void> => {
  const result = await queue.processNext(work, new Date());
  if (result.status !== "empty") {
    await processAll();
  }
};

const deliver = async (event: Record<string, unknown>) => {
  const eventId = await seedWebhook(event);
  await processAll();
  return eventId;
};

const purchase = (userId: string, overrides: Record<string, unknown> = {}) => ({
  type: "INITIAL_PURCHASE",
  app_user_id: userId,
  event_timestamp_ms: at(0),
  expiration_at_ms: at(30),
  ...overrides,
});

const entitlementsOf = (userId: string) =>
  prisma.monetizationEntitlement.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

const outboxOf = async (userId: string) =>
  (await prisma.monetizationOutbox.findMany({ orderBy: [{ occurredAt: "asc" }, { id: "asc" }] }))
    .filter(
      ({ payload }) =>
        typeof payload === "object" &&
        payload !== null &&
        "userId" in payload &&
        payload.userId === userId,
    )
    .map(({ name, version, payload, occurredAt }) => ({ name, version, payload, occurredAt }));

const webhookRow = (eventId: string) =>
  prisma.monetizationProcessedWebhookEvent.findUniqueOrThrow({
    where: { provider_eventId: { provider: PROVIDER, eventId } },
  });

afterAll(async () => {
  await prisma.monetizationProcessedWebhookEvent.deleteMany({ where: { provider: PROVIDER } });
  await prisma.monetizationEntitlement.deleteMany({ where: { userId: { in: seededUsers } } });
  const outbox = await prisma.monetizationOutbox.findMany();
  await prisma.monetizationOutbox.deleteMany({
    where: {
      id: {
        in: outbox
          .filter(
            ({ payload }) =>
              typeof payload === "object" &&
              payload !== null &&
              "userId" in payload &&
              typeof payload.userId === "string" &&
              seededUsers.includes(payload.userId),
          )
          .map(({ id }) => id),
      },
    },
  });
  await prisma.$disconnect();
});

describe("traitement des webhooks RevenueCat reçus (ADR 0014, ADR 0051 §2)", () => {
  it("un achat initial Turbo crée l'entitlement et écrit granted dans la même transaction", async () => {
    const userId = newUser();

    const eventId = await deliver(purchase(userId));

    expect(await entitlementsOf(userId)).toEqual([
      expect.objectContaining({
        scope: "PLATFORM",
        channelId: null,
        status: "ACTIVE",
        source: "APPLE_IAP",
        expiresAt: new Date(at(30)),
        willRenew: true,
        providerReference: "2000000123456789",
        lastEventAt: new Date(at(0)),
      }),
    ]);
    expect(await outboxOf(userId)).toEqual([
      {
        name: "monetization.entitlement.granted",
        version: 1,
        payload: { userId, scope: "platform", expiresAt: new Date(at(30)).toISOString() },
        occurredAt: new Date(at(0)),
      },
    ]);
    expect(await webhookRow(eventId)).toMatchObject({ outcome: "applied", attempts: 0 });
    expect((await webhookRow(eventId)).processedAt).not.toBeNull();
  });

  it("un renouvellement prolonge sans recréer et republie granted avec la nouvelle échéance", async () => {
    const userId = newUser();
    await deliver(purchase(userId));

    await deliver({
      type: "RENEWAL",
      app_user_id: userId,
      event_timestamp_ms: at(30),
      expiration_at_ms: at(60),
    });

    expect(await entitlementsOf(userId)).toEqual([
      expect.objectContaining({ status: "ACTIVE", expiresAt: new Date(at(60)) }),
    ]);
    expect((await outboxOf(userId)).map(({ name, payload }) => ({ name, payload }))).toEqual([
      {
        name: "monetization.entitlement.granted",
        payload: { userId, scope: "platform", expiresAt: new Date(at(30)).toISOString() },
      },
      {
        name: "monetization.entitlement.granted",
        payload: { userId, scope: "platform", expiresAt: new Date(at(60)).toISOString() },
      },
    ]);
  });

  it("une expiration coupe l'accès et écrit revoked", async () => {
    const userId = newUser();
    await deliver(purchase(userId));

    await deliver({ type: "EXPIRATION", app_user_id: userId, event_timestamp_ms: at(31) });

    expect(await entitlementsOf(userId)).toEqual([expect.objectContaining({ status: "EXPIRED" })]);
    expect((await outboxOf(userId)).at(-1)).toEqual({
      name: "monetization.entitlement.revoked",
      version: 1,
      payload: { userId, scope: "platform" },
      occurredAt: new Date(at(31)),
    });
  });

  it("une expiration arrivée avant l'achat qu'elle suit est appliquée, puis l'achat est ignoré", async () => {
    const userId = newUser();
    await deliver(purchase(userId));
    await deliver({ type: "EXPIRATION", app_user_id: userId, event_timestamp_ms: at(31) });

    const late = await deliver({
      type: "RENEWAL",
      app_user_id: userId,
      event_timestamp_ms: at(29),
      expiration_at_ms: at(59),
    });

    expect(await webhookRow(late)).toMatchObject({ outcome: "stale" });
    expect(await entitlementsOf(userId)).toEqual([expect.objectContaining({ status: "EXPIRED" })]);
  });

  it("un type non traité n'écrit rien, est marqué traité et lève une alerte", async () => {
    const userId = newUser();

    const eventId = await deliver({
      type: "UNCANCELLATION",
      app_user_id: userId,
      event_timestamp_ms: at(0),
    });

    expect(await entitlementsOf(userId)).toEqual([]);
    expect(await outboxOf(userId)).toEqual([]);
    expect(await webhookRow(eventId)).toMatchObject({ outcome: "unhandled_type" });
    expect(alerts).toContainEqual({ eventId, reason: "unhandled_type" });
  });

  it("un traitement rejoué n'écrit pas une seconde fois", async () => {
    const userId = newUser();
    const eventId = await deliver(purchase(userId));
    await prisma.monetizationProcessedWebhookEvent.update({
      where: { provider_eventId: { provider: PROVIDER, eventId } },
      data: { processedAt: null, outcome: null },
    });

    await processAll();

    expect(await entitlementsOf(userId)).toHaveLength(1);
    expect(await outboxOf(userId)).toHaveLength(1);
  });

  it("un transfert révoque l'origine et recrée l'entitlement sur la cible", async () => {
    const origin = newUser();
    const target = newUser();
    await deliver(purchase(origin));

    await deliver({
      type: "TRANSFER",
      entitlement_ids: null,
      event_timestamp_ms: at(5),
      transferred_from: [origin],
      transferred_to: [target],
    });

    expect(await entitlementsOf(origin)).toEqual([expect.objectContaining({ status: "REVOKED" })]);
    expect(await entitlementsOf(target)).toEqual([
      expect.objectContaining({ status: "ACTIVE", expiresAt: new Date(at(30)) }),
    ]);
    expect((await outboxOf(origin)).at(-1)).toMatchObject({
      name: "monetization.entitlement.revoked",
    });
    expect(await outboxOf(target)).toEqual([
      expect.objectContaining({ name: "monetization.entitlement.granted" }),
    ]);
  });

  it("un échec annule les écritures du traitement et reprogramme l'événement", async () => {
    const userId = newUser();
    const eventId = await seedWebhook(purchase(userId));
    const before = new Date();

    const result = await queue.processNext(async (webhook, ledger) => {
      await work(webhook, ledger);
      throw new Error("panne au milieu du traitement");
    }, before);

    expect(result).toEqual({ status: "failed", eventId, error: "panne au milieu du traitement" });
    expect(await entitlementsOf(userId)).toEqual([]);
    expect(await outboxOf(userId)).toEqual([]);
    const row = await webhookRow(eventId);
    expect(row).toMatchObject({
      processedAt: null,
      attempts: 1,
      lastError: "panne au milieu du traitement",
    });
    expect(row.nextAttemptAt.getTime()).toBe(before.getTime() + 60_000);
    expect(await queue.processNext(work, before)).toEqual({ status: "empty" });
  });
});
