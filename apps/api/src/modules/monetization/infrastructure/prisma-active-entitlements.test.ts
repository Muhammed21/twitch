import { describe, expect, it } from "vitest";

import {
  type EntitlementRows,
  type EntitlementRowsQuery,
  prismaActiveEntitlements,
} from "./prisma-active-entitlements.ts";

const NOW = new Date("2026-11-08T09:00:00.000Z");

const IN_THIRTY_DAYS = new Date("2026-12-08T09:00:00.000Z");

const IN_A_YEAR = new Date("2027-11-08T09:00:00.000Z");

const storedRows = (rows: readonly { expiresAt: Date | null }[]) => {
  const queries: EntitlementRowsQuery[] = [];
  const prisma: EntitlementRows = {
    monetizationEntitlement: {
      findMany: async (query) => {
        queries.push(query);
        return rows.slice(0, query.take);
      },
    },
  };
  return { prisma, queries };
};

describe("lecture bornée des entitlements actifs (ADR 0008 §a)", () => {
  it("rend au plus un entitlement Turbo, même si le stockage en contient plusieurs", async () => {
    const { prisma } = storedRows([{ expiresAt: IN_A_YEAR }, { expiresAt: IN_THIRTY_DAYS }]);

    expect(await prismaActiveEntitlements({ prisma, now: () => NOW })("user")).toEqual([
      { scope: "platform", expiresAt: IN_A_YEAR },
    ]);
  });

  it("lit d'abord l'échéance la plus lointaine, à égalité par identifiant", async () => {
    const { prisma, queries } = storedRows([]);

    await prismaActiveEntitlements({ prisma, now: () => NOW })("user");

    expect(queries.map(({ orderBy }) => orderBy)).toEqual([[{ expiresAt: "desc" }, { id: "asc" }]]);
  });
});
