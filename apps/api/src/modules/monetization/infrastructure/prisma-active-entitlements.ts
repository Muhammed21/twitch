export type ActiveEntitlement = {
  readonly scope: "platform";
  readonly expiresAt: Date;
};

const PLATFORM_ENTITLEMENTS_PER_ACCOUNT = 1;

export type EntitlementRowsQuery = {
  where: {
    userId: string;
    scope: "PLATFORM";
    status: { in: ("ACTIVE" | "GRACE")[] };
    expiresAt: { gt: Date };
  };
  orderBy: [{ expiresAt: "desc" }, { id: "asc" }];
  take: number;
  select: { expiresAt: true };
};

export type EntitlementRows = {
  monetizationEntitlement: {
    findMany: (query: EntitlementRowsQuery) => Promise<readonly { expiresAt: Date | null }[]>;
  };
};

export const prismaActiveEntitlements =
  ({ prisma, now = () => new Date() }: { prisma: EntitlementRows; now?: () => Date }) =>
  async (userId: string): Promise<readonly ActiveEntitlement[]> => {
    const rows = await prisma.monetizationEntitlement.findMany({
      where: {
        userId,
        scope: "PLATFORM",
        status: { in: ["ACTIVE", "GRACE"] },
        expiresAt: { gt: now() },
      },
      orderBy: [{ expiresAt: "desc" }, { id: "asc" }],
      take: PLATFORM_ENTITLEMENTS_PER_ACCOUNT,
      select: { expiresAt: true },
    });
    return rows.flatMap(({ expiresAt }) =>
      expiresAt === null ? [] : [{ scope: "platform" as const, expiresAt }],
    );
  };
