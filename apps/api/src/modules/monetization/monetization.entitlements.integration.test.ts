import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createActiveEntitlementsReader } from "./monetization.module.ts";

const prisma = createContextClient({ context: "monetization", env: process.env });

const NOW = new Date("2026-11-08T09:00:00.000Z");

const IN_THIRTY_DAYS = new Date("2026-12-08T09:00:00.000Z");

const YESTERDAY = new Date("2026-11-07T09:00:00.000Z");

const readEntitlements = createActiveEntitlementsReader({ prisma, now: () => NOW });

const seededUsers: string[] = [];

const seedEntitlement = async (
  overrides: {
    status?: "ACTIVE" | "GRACE" | "EXPIRED" | "REVOKED";
    expiresAt?: Date;
    scope?: "PLATFORM" | "CHANNEL";
    channelId?: string;
  } = {},
) => {
  const userId = randomUUID();
  seededUsers.push(userId);
  await prisma.monetizationEntitlement.create({
    data: {
      id: randomUUID(),
      userId,
      scope: "PLATFORM",
      status: "ACTIVE",
      source: "APPLE_IAP",
      expiresAt: IN_THIRTY_DAYS,
      lastEventAt: YESTERDAY,
      ...overrides,
    },
  });
  return userId;
};

afterAll(async () => {
  await prisma.monetizationEntitlement.deleteMany({ where: { userId: { in: seededUsers } } });
  await prisma.$disconnect();
});

describe("entitlements actifs lus pour bootstrap (ADR 0014, ADR 0051)", () => {
  it.each([["ACTIVE" as const], ["GRACE" as const]])(
    "rend l'entitlement Turbo %s avec son échéance",
    async (status) => {
      const userId = await seedEntitlement({ status });

      expect(await readEntitlements(userId)).toEqual([
        { scope: "platform", expiresAt: IN_THIRTY_DAYS },
      ]);
    },
  );

  it.each([["EXPIRED" as const], ["REVOKED" as const]])(
    "ne rend pas un entitlement %s",
    async (status) => {
      expect(await readEntitlements(await seedEntitlement({ status }))).toEqual([]);
    },
  );

  it("ne rend pas un entitlement actif dont l'échéance est passée", async () => {
    expect(await readEntitlements(await seedEntitlement({ expiresAt: YESTERDAY }))).toEqual([]);
  });

  it("ne rend pas un entitlement de chaîne", async () => {
    const userId = await seedEntitlement({ scope: "CHANNEL", channelId: randomUUID() });

    expect(await readEntitlements(userId)).toEqual([]);
  });

  it("ne rend pas l'entitlement d'un autre utilisateur", async () => {
    await seedEntitlement();

    expect(await readEntitlements(randomUUID())).toEqual([]);
  });
});
