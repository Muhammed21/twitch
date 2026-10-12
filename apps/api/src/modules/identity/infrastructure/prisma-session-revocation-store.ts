import type { SessionRevocationStore } from "../application/revoke-all-sessions.ts";
import type { IdentityPrisma } from "./better-auth.ts";

export const prismaSessionRevocationStore = (prisma: IdentityPrisma): SessionRevocationStore => ({
  revokeAll: ({ userId, reason, userAgent }) =>
    prisma.$transaction(async (tx) => {
      const sessions = await tx.identitySession.findMany({
        where: { userId },
        select: { id: true },
      });
      const sids = sessions.map(({ id }) => id);
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
          stateAfter: { revokedSids: sids },
        },
      });
      return sids;
    }),
});
