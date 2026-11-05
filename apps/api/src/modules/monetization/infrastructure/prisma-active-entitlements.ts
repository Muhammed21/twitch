import type { MonetizationPrisma } from "./prisma-webhook-inbox.ts";

export type ActiveEntitlement = {
  readonly scope: "platform";
  readonly expiresAt: Date;
};

export const prismaActiveEntitlements =
  ({ prisma, now = () => new Date() }: { prisma: MonetizationPrisma; now?: () => Date }) =>
  async (userId: string): Promise<readonly ActiveEntitlement[]> => {
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
