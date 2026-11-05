import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";

const AUTHORIZATION = `Bearer ${randomUUID()}`;

const prisma = createContextClient({ context: "monetization", env: process.env });

const seededEventIds: string[] = [];

const withApi = async (
  env: Readonly<Record<string, string | undefined>>,
  run: (url: string) => Promise<void>,
) => {
  const { app } = await createApp({ env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/webhooks/revenuecat`);
  } finally {
    await app.close();
  }
};

const configured = { ...process.env, REVENUECAT_WEBHOOK_AUTHORIZATION: AUTHORIZATION };

const makeWebhook = (eventId = randomUUID()) => {
  seededEventIds.push(eventId);
  return {
    eventId,
    body: JSON.stringify({
      api_version: "1.0",
      event: {
        id: eventId,
        type: "INITIAL_PURCHASE",
        event_timestamp_ms: 1_794_128_400_000,
        app_user_id: randomUUID(),
        entitlement_ids: ["turbo"],
      },
    }),
  };
};

const deliver = (url: string, { body, authorization }: { body: string; authorization?: string }) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === undefined ? {} : { authorization }),
    },
    body,
  });

const receivedOf = (eventId: string) =>
  prisma.monetizationProcessedWebhookEvent.findMany({ where: { provider: "revenuecat", eventId } });

const rejectedWith = (marker: string) =>
  prisma.monetizationRejectedWebhook.findMany({ where: { body: { contains: marker } } });

afterAll(async () => {
  await prisma.monetizationProcessedWebhookEvent.deleteMany({
    where: { eventId: { in: seededEventIds } },
  });
  await prisma.monetizationRejectedWebhook.deleteMany({
    where: { OR: seededEventIds.map((eventId) => ({ body: { contains: eventId } })) },
  });
  await prisma.$disconnect();
});

describe("POST /v1/webhooks/revenuecat (ADR 0014, ADR 0051 §2)", () => {
  it("enregistre l'événement brut, à traiter, et répond 200", async () => {
    const webhook = makeWebhook();

    await withApi(configured, async (url) => {
      expect((await deliver(url, { ...webhook, authorization: AUTHORIZATION })).status).toBe(200);
    });

    expect(await receivedOf(webhook.eventId)).toEqual([
      expect.objectContaining({
        payload: JSON.parse(webhook.body),
        processedAt: null,
        outcome: null,
      }),
    ]);
  });

  it("enregistre en 200 un événement dont une chaîne contient NUL, sans ce caractère", async () => {
    const eventId = randomUUID();
    seededEventIds.push(eventId);
    const body = JSON.stringify({
      api_version: "1.0",
      event: {
        id: eventId,
        type: "INITIAL_PURCHASE",
        event_timestamp_ms: 1_794_128_400_000,
        product_id: "turbo\u0000_monthly",
      },
    });

    await withApi(configured, async (url) => {
      expect((await deliver(url, { body, authorization: AUTHORIZATION })).status).toBe(200);
    });

    expect(await receivedOf(eventId)).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          event: expect.objectContaining({ product_id: "turbo_monthly" }),
        }),
      }),
    ]);
  });

  it("répond 200 à un doublon sans écrire de seconde ligne", async () => {
    const webhook = makeWebhook();

    await withApi(configured, async (url) => {
      expect((await deliver(url, { ...webhook, authorization: AUTHORIZATION })).status).toBe(200);
      expect((await deliver(url, { ...webhook, authorization: AUTHORIZATION })).status).toBe(200);
    });

    expect(await receivedOf(webhook.eventId)).toHaveLength(1);
  });

  it.each([
    ["absent", undefined],
    ["faux", "Bearer faux"],
  ])(
    "refuse en 401 un en-tête %s et archive le corps sans l'enregistrer",
    async (_name, authorization) => {
      const webhook = makeWebhook();

      await withApi(configured, async (url) => {
        const response = await deliver(url, {
          body: webhook.body,
          ...(authorization === undefined ? {} : { authorization }),
        });

        expect(response.status).toBe(401);
      });

      expect(await receivedOf(webhook.eventId)).toEqual([]);
      expect(await rejectedWith(webhook.eventId)).toEqual([
        expect.objectContaining({
          provider: "revenuecat",
          reason: "unauthorized",
          body: webhook.body,
        }),
      ]);
    },
  );

  it("refuse en 400 un payload hors contrat, l'archive et ne l'enregistre pas", async () => {
    const eventId = randomUUID();
    seededEventIds.push(eventId);
    const body = JSON.stringify({ api_version: "1.0", event: { id: eventId, type: "RENEWAL" } });

    await withApi(configured, async (url) => {
      expect((await deliver(url, { body, authorization: AUTHORIZATION })).status).toBe(400);
    });

    expect(await receivedOf(eventId)).toEqual([]);
    expect(await rejectedWith(eventId)).toEqual([
      expect.objectContaining({ reason: "malformed", body }),
    ]);
  });

  it("répond 503 sans rien écrire quand l'en-tête attendu n'est pas configuré", async () => {
    const webhook = makeWebhook();

    await withApi({ ...process.env, REVENUECAT_WEBHOOK_AUTHORIZATION: undefined }, async (url) => {
      expect((await deliver(url, { ...webhook, authorization: AUTHORIZATION })).status).toBe(503);
    });

    expect(await receivedOf(webhook.eventId)).toEqual([]);
    expect(await rejectedWith(webhook.eventId)).toEqual([]);
  });
});
