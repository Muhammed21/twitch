import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox, type createContextClient } from "@repo/db";

import type { TimeoutLedger } from "../application/timeout-user.ts";

export type ModerationPrisma = ReturnType<typeof createContextClient>;

const OUTBOX = { schema: "moderation", table: "ModerationOutbox" };

const { userTimedOut } = events.moderation;

export const prismaTimeoutLedger = (prisma: ModerationPrisma): TimeoutLedger => ({
  record: ({ timeoutId, outboxEventId, channelId, targetId, actorId, issuedAt, expiresAt }) =>
    prisma.$transaction(async (tx) => {
      await tx.authzRoleAssignment.create({
        data: {
          id: timeoutId,
          subjectId: targetId,
          role: "banned",
          scopeType: "channel",
          scopeId: channelId,
          grantedBy: actorId,
          grantedAt: issuedAt,
          expiresAt,
        },
      });
      await tx.auditEntry.create({
        data: {
          occurredAt: issuedAt,
          actorId,
          action: userTimedOut.name,
          scopeType: "channel",
          scopeId: channelId,
          targetId,
          stateAfter: {
            assignmentId: timeoutId,
            role: "banned",
            expiresAt: expiresAt.toISOString(),
          },
        },
      });
      const payload = {
        channelId,
        userId: targetId,
        expiresAt: expiresAt.toISOString(),
      } satisfies z.input<typeof userTimedOut.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: userTimedOut.name,
          version: userTimedOut.version,
          payload,
          occurredAt: issuedAt,
        },
      });
    }),
});
