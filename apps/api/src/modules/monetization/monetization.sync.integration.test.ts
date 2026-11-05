import { randomUUID } from "node:crypto";

import { Test } from "@nestjs/testing";
import { afterAll, describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { createContextClient } from "@repo/db";
import { ok } from "@repo/result";

import type { AccessTokenVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import { memoryWindowCounter } from "../../platform/testing/memory-window-counter.ts";
import { MonetizationModule } from "./monetization.module.ts";

const prisma = createContextClient({ context: "monetization", env: process.env });

const DAY_MS = 24 * 60 * 60 * 1000;

const seededUsers: string[] = [];

const newUser = () => {
  const userId = randomUUID();
  seededUsers.push(userId);
  return userId;
};

const verifierFor = (userId: string): AccessTokenVerifier => ({
  verify: async () =>
    ok<AccessTokenIdentity>({
      userId,
      sid: "sid-1",
      scopes: [],
      authTime: null,
      amr: [],
      revocation: "checked",
    }),
});

const activeAtRevenueCat = (expiresAt: Date) => async () =>
  new Response(
    JSON.stringify({
      request_date_ms: Date.now(),
      subscriber: {
        entitlements: {
          turbo: {
            expires_date: expiresAt.toISOString(),
            grace_period_expires_date: null,
            product_identifier: "turbo_monthly",
          },
        },
        subscriptions: {
          turbo_monthly: { unsubscribe_detected_at: null, billing_issues_detected_at: null },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const unreachable = async (): Promise<Response> => {
  throw new Error("ECONNREFUSED");
};

const withApi = async (
  {
    userId,
    fetch,
  }: { userId: string; fetch: (input: string, init?: RequestInit) => Promise<Response> },
  run: (sync: () => Promise<Response>) => Promise<void>,
) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifierFor(userId),
      }),
      MonetizationModule.register({
        prisma,
        webhookAuthorization: undefined,
        secretApiKey: "sk_cle_de_test",
        counter: memoryWindowCounter().counter,
        logSink: () => {},
        revenueCatFetch: fetch,
        webhookProcessingIntervalMs: 3_600_000,
      }),
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run(() =>
      globalThis.fetch(`${url}/v1/me/entitlements/sync`, {
        method: "POST",
        headers: { authorization: "Bearer jeton" },
      }),
    );
  } finally {
    await app.close();
  }
};

const grantedOf = async (userId: string) =>
  (await prisma.monetizationOutbox.findMany()).filter(
    ({ name, payload }) =>
      name === "monetization.entitlement.granted" &&
      typeof payload === "object" &&
      payload !== null &&
      "userId" in payload &&
      payload.userId === userId,
  );

afterAll(async () => {
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

describe("POST /v1/me/entitlements/sync sur la base (ADR 0051 §2)", () => {
  it("rend actif un abonné actif chez RevenueCat, écrit granted et rend l'entitlement", async () => {
    const userId = newUser();
    const expiresAt = new Date(Math.floor((Date.now() + 30 * DAY_MS) / 1000) * 1000);

    await withApi({ userId, fetch: activeAtRevenueCat(expiresAt) }, async (sync) => {
      const response = await sync();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        entitlements: [{ scope: "platform", expiresAt: expiresAt.toISOString() }],
      });
    });

    expect(await prisma.monetizationEntitlement.findMany({ where: { userId } })).toEqual([
      expect.objectContaining({ scope: "PLATFORM", status: "ACTIVE", expiresAt }),
    ]);
    expect(await grantedOf(userId)).toHaveLength(1);
  });

  it("n'écrit pas un second granted pour un état déjà appliqué", async () => {
    const userId = newUser();
    const expiresAt = new Date(Math.floor((Date.now() + 30 * DAY_MS) / 1000) * 1000);

    await withApi({ userId, fetch: activeAtRevenueCat(expiresAt) }, async (sync) => {
      await sync();
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      expect((await sync()).status).toBe(200);
    });

    expect(await grantedOf(userId)).toHaveLength(1);
  });

  it("répond 503 sans toucher à l'entitlement quand RevenueCat est injoignable", async () => {
    const userId = newUser();

    await withApi({ userId, fetch: unreachable }, async (sync) => {
      expect((await sync()).status).toBe(503);
    });

    expect(await prisma.monetizationEntitlement.findMany({ where: { userId } })).toEqual([]);
    expect(await grantedOf(userId)).toEqual([]);
  });
});
