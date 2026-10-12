import { collectByKeyset } from "@repo/db";

import type { SessionRevocationStore } from "../application/revoke-all-sessions.ts";
import type { IdentityPrisma } from "./better-auth.ts";

const SESSION_PAGE_SIZE = 500;

export const prismaSessionRevocationStore = (
  prisma: IdentityPrisma,
  { pageSize = SESSION_PAGE_SIZE }: { pageSize?: number } = {},
): SessionRevocationStore => ({
  revokeAll: ({ userId, reason, userAgent }) =>
    prisma.$transaction(async (tx) => {
      const sids = await collectByKeyset<string>({
        pageSize,
        keyOf: (sid) => sid,
        fetchPage: async ({ take, after }) => {
          const page = await tx.identitySession.findMany({
            where: { userId, id: { gt: after } },
            select: { id: true },
            orderBy: { id: "asc" },
            take,
          });
          return page.map(({ id }) => id);
        },
      });
      await tx.identityOAuthRefreshToken.updateMany({
        where: { userId, revoked: null },
        data: { revoked: new Date() },
      });
      await tx.identitySession.deleteMany({ where: { userId } });
      await tx.auditEntry.create({
        data: {
          actorId: userId,
          targetId: userId,
          action: "identity.session.revoked",
          reason,
          userAgent,
          stateAfter: { revokedSids: [...sids] },
        },
      });
      return sids;
    }),
});
