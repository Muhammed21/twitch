import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { BanLedger } from "../application/ban-user.ts";
import type { ModerationPrisma } from "./prisma-timeout-ledger.ts";

const OUTBOX = { schema: "moderation", table: "ModerationOutbox" };

const { userBanned } = events.moderation;

export const prismaBanLedger = (prisma: ModerationPrisma): BanLedger => ({
  record: ({ banId, outboxEventId, actor, channelId, targetId, issuedAt, expiresAt, reason }) =>
    prisma.$transaction(async (tx) => {
      await tx.authzRoleAssignment.create({
        data: {
          id: banId,
          subjectId: targetId,
          role: "banned",
          scopeType: "channel",
          scopeId: channelId,
          grantedBy: actor.actorId,
          grantedAt: issuedAt,
          expiresAt,
          reason,
        },
      });
      await tx.auditEntry.create({
        data: {
          occurredAt: issuedAt,
          actorId: actor.actorId,
          onBehalfOf: actor.onBehalfOf,
          source: actor.source,
          action: userBanned.name,
          scopeType: "channel",
          scopeId: channelId,
          targetId,
          reason,
          stateAfter: {
            assignmentId: banId,
            role: "banned",
            expiresAt: expiresAt?.toISOString() ?? null,
          },
        },
      });
      const payload = {
        channelId,
        userId: targetId,
        expiresAt: expiresAt?.toISOString() ?? null,
      } satisfies z.input<typeof userBanned.payload>;
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event: {
          id: outboxEventId,
          name: userBanned.name,
          version: userBanned.version,
          payload,
          occurredAt: issuedAt,
        },
      });
    }),
});
