import type { ReadActiveEntitlements } from "../application/sync-turbo-entitlement.ts";
import type { MonetizationPrisma } from "./prisma-webhook-inbox.ts";

export const prismaActiveEntitlements =
  ({
    prisma,
    now = () => new Date(),
  }: {
    prisma: MonetizationPrisma;
    now?: () => Date;
  }): ReadActiveEntitlements =>
  async (userId) => {
    const rows = await prisma.monetizationEntitlement.findMany({
      where: {
        userId,
        scope: "PLATFORM",
        status: { in: ["ACTIVE", "GRACE"] },
        expiresAt: { gt: now() },
      },
      select: { expiresAt: true },
    });
    return rows.flatMap(({ expiresAt }) =>
      expiresAt === null ? [] : [{ scope: "platform" as const, expiresAt }],
    );
  };
