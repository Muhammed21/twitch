import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "./index.ts";

const UNIQUE_VIOLATION = "P2002";
const SCOPE_CHANNEL_CHECK =
  /violates check constraint "MonetizationEntitlement_scope_channelId_check"/;

const db = createContextClient({ context: "monetization" });

const seededUsers: string[] = [];

const newUser = (): string => {
  const userId = randomUUID();
  seededUsers.push(userId);
  return userId;
};

const makePlatformEntitlement = (
  userId: string,
  status: "ACTIVE" | "GRACE" | "EXPIRED" | "REVOKED",
) => ({
  id: randomUUID(),
  userId,
  scope: "PLATFORM" as const,
  status,
  source: "APPLE_IAP" as const,
  expiresAt: new Date("2026-12-08T09:00:00.000Z"),
  lastEventAt: new Date("2026-11-08T09:00:00.000Z"),
});

const errorCodeOf = (operation: Promise<unknown>): Promise<string> =>
  operation.then(
    () => "ok",
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : String(error),
  );

afterAll(async () => {
  await db.monetizationEntitlement.deleteMany({ where: { userId: { in: seededUsers } } });
  await db.$disconnect();
});

describe("entitlement de portée plateforme", () => {
  it.each([
    ["ACTIVE", "ACTIVE"],
    ["ACTIVE", "GRACE"],
    ["GRACE", "ACTIVE"],
  ] as const)(
    "refuse un second entitlement actif (%s puis %s) pour le même utilisateur",
    async (first, second) => {
      const userId = newUser();
      await db.monetizationEntitlement.create({ data: makePlatformEntitlement(userId, first) });

      expect(
        await errorCodeOf(
          db.monetizationEntitlement.create({ data: makePlatformEntitlement(userId, second) }),
        ),
      ).toBe(UNIQUE_VIOLATION);
    },
  );

  it.each(["EXPIRED", "REVOKED"] as const)(
    "accepte un nouvel entitlement actif après un entitlement %s",
    async (ended) => {
      const userId = newUser();
      await db.monetizationEntitlement.create({ data: makePlatformEntitlement(userId, ended) });

      expect(
        await errorCodeOf(
          db.monetizationEntitlement.create({ data: makePlatformEntitlement(userId, "ACTIVE") }),
        ),
      ).toBe("ok");
    },
  );

  it("accepte un entitlement actif par utilisateur", async () => {
    await db.monetizationEntitlement.create({
      data: makePlatformEntitlement(newUser(), "ACTIVE"),
    });

    expect(
      await errorCodeOf(
        db.monetizationEntitlement.create({ data: makePlatformEntitlement(newUser(), "ACTIVE") }),
      ),
    ).toBe("ok");
  });

  it("refuse un entitlement de plateforme qui porte une chaîne", async () => {
    await expect(
      db.monetizationEntitlement.create({
        data: { ...makePlatformEntitlement(newUser(), "ACTIVE"), channelId: randomUUID() },
      }),
    ).rejects.toThrow(SCOPE_CHANNEL_CHECK);
  });
});

describe("entitlement de portée chaîne", () => {
  const makeChannelEntitlement = ({
    userId,
    channelId,
    status,
  }: {
    userId: string;
    channelId: string | null;
    status: "ACTIVE" | "GRACE" | "EXPIRED" | "REVOKED";
  }) => ({
    ...makePlatformEntitlement(userId, status),
    scope: "CHANNEL" as const,
    channelId,
  });

  it("refuse un entitlement de chaîne sans chaîne", async () => {
    await expect(
      db.monetizationEntitlement.create({
        data: makeChannelEntitlement({ userId: newUser(), channelId: null, status: "ACTIVE" }),
      }),
    ).rejects.toThrow(SCOPE_CHANNEL_CHECK);
  });

  it.each([
    ["ACTIVE", "ACTIVE"],
    ["ACTIVE", "GRACE"],
    ["GRACE", "ACTIVE"],
  ] as const)(
    "refuse un second entitlement actif (%s puis %s) sur la même chaîne pour le même utilisateur",
    async (first, second) => {
      const userId = newUser();
      const channelId = randomUUID();
      await db.monetizationEntitlement.create({
        data: makeChannelEntitlement({ userId, channelId, status: first }),
      });

      expect(
        await errorCodeOf(
          db.monetizationEntitlement.create({
            data: makeChannelEntitlement({ userId, channelId, status: second }),
          }),
        ),
      ).toBe(UNIQUE_VIOLATION);
    },
  );

  it.each(["EXPIRED", "REVOKED"] as const)(
    "accepte un nouvel entitlement actif sur la chaîne après un entitlement %s",
    async (ended) => {
      const userId = newUser();
      const channelId = randomUUID();
      await db.monetizationEntitlement.create({
        data: makeChannelEntitlement({ userId, channelId, status: ended }),
      });

      expect(
        await errorCodeOf(
          db.monetizationEntitlement.create({
            data: makeChannelEntitlement({ userId, channelId, status: "ACTIVE" }),
          }),
        ),
      ).toBe("ok");
    },
  );

  it("garde des entitlements actifs sur plusieurs chaînes pour un même utilisateur", async () => {
    const userId = newUser();
    await db.monetizationEntitlement.create({
      data: makeChannelEntitlement({ userId, channelId: randomUUID(), status: "ACTIVE" }),
    });

    expect(
      await errorCodeOf(
        db.monetizationEntitlement.create({
          data: makeChannelEntitlement({ userId, channelId: randomUUID(), status: "ACTIVE" }),
        }),
      ),
    ).toBe("ok");
  });

  it("garde un entitlement de chaîne actif à côté de l'entitlement de plateforme", async () => {
    const userId = newUser();
    await db.monetizationEntitlement.create({ data: makePlatformEntitlement(userId, "ACTIVE") });

    expect(
      await errorCodeOf(
        db.monetizationEntitlement.create({
          data: makeChannelEntitlement({ userId, channelId: randomUUID(), status: "ACTIVE" }),
        }),
      ),
    ).toBe("ok");
  });

  it("indexe les entitlements par chaîne et statut pour les vérifications du chat", async () => {
    const indexes = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'monetization' AND tablename = 'MonetizationEntitlement'`;

    expect(indexes.map(({ indexdef }) => indexdef)).toContainEqual(
      expect.stringMatching(/\("channelId", status\)$/),
    );
  });
});

describe("événements de webhook reçus", () => {
  it("refuse un même événement d'un même fournisseur", async () => {
    const eventId = randomUUID();
    const received = { provider: "revenuecat", eventId, payload: { id: eventId } };
    await db.monetizationProcessedWebhookEvent.create({ data: received });

    expect(await errorCodeOf(db.monetizationProcessedWebhookEvent.create({ data: received }))).toBe(
      UNIQUE_VIOLATION,
    );
    await db.monetizationProcessedWebhookEvent.deleteMany({ where: { eventId } });
  });

  it("accepte le même identifiant venu d'un autre fournisseur", async () => {
    const eventId = randomUUID();
    await db.monetizationProcessedWebhookEvent.create({
      data: { provider: "revenuecat", eventId, payload: {} },
    });

    expect(
      await errorCodeOf(
        db.monetizationProcessedWebhookEvent.create({
          data: { provider: "stripe", eventId, payload: {} },
        }),
      ),
    ).toBe("ok");
    await db.monetizationProcessedWebhookEvent.deleteMany({ where: { eventId } });
  });
});
