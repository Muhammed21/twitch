import { randomUUID } from "node:crypto";

import type { z } from "zod";

import { events } from "@repo/contracts";
import { appendToOutbox } from "@repo/db";

import type { TurboLedgerTransaction } from "../application/apply-turbo-command.ts";
import type { EntitlementStatus, TurboEntitlement } from "../domain/turbo-entitlement.ts";
import type { MonetizationPrisma } from "./prisma-webhook-inbox.ts";

export type MonetizationTransaction = Parameters<
  Parameters<MonetizationPrisma["$transaction"]>[0]
>[0];

type Row = Awaited<ReturnType<MonetizationTransaction["monetizationEntitlement"]["findFirst"]>>;

const OUTBOX = { schema: "monetization", table: "MonetizationOutbox" };
const PLATFORM_SCOPE = "platform";

const { entitlementGranted, entitlementRevoked } = events.monetization;

const TO_DATABASE = {
  active: "ACTIVE",
  grace: "GRACE",
  expired: "EXPIRED",
  revoked: "REVOKED",
} as const satisfies Record<EntitlementStatus, string>;

const FROM_DATABASE = {
  ACTIVE: "active",
  GRACE: "grace",
  EXPIRED: "expired",
  REVOKED: "revoked",
} as const;

const toEntitlement = (row: NonNullable<Row>): TurboEntitlement => ({
  id: row.id,
  userId: row.userId,
  status: FROM_DATABASE[row.status],
  expiresAt: row.expiresAt ?? row.lastEventAt,
  willRenew: row.willRenew,
  providerReference: row.providerReference ?? undefined,
  lastEventAt: row.lastEventAt,
});

const lockKey = (userId: string) => `monetization.turbo:${userId}`;

export const prismaTurboLedger = (tx: MonetizationTransaction): TurboLedgerTransaction => ({
  lock: async (userIds) => {
    for (const userId of [...new Set(userIds)].toSorted()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(userId)}, 0))`;
    }
  },
  current: async (userId) => {
    const where = { userId, scope: "PLATFORM" } as const;
    const row =
      (await tx.monetizationEntitlement.findFirst({
        where: { ...where, status: { in: ["ACTIVE", "GRACE"] } },
      })) ??
      (await tx.monetizationEntitlement.findFirst({
        where,
        orderBy: [{ lastEventAt: "desc" }, { createdAt: "desc" }],
      }));
    return row === null ? undefined : toEntitlement(row);
  },
  save: async (entitlements) => {
    for (const entitlement of entitlements) {
      const fields = {
        status: TO_DATABASE[entitlement.status],
        expiresAt: entitlement.expiresAt,
        willRenew: entitlement.willRenew,
        providerReference: entitlement.providerReference ?? null,
        lastEventAt: entitlement.lastEventAt,
      };
      await tx.monetizationEntitlement.upsert({
        where: { id: entitlement.id },
        create: {
          id: entitlement.id,
          userId: entitlement.userId,
          scope: "PLATFORM",
          source: "APPLE_IAP",
          ...fields,
        },
        update: fields,
      });
    }
  },
  publish: async (changes, occurredAt) => {
    for (const change of changes) {
      await appendToOutbox(tx, {
        outbox: OUTBOX,
        event:
          change.type === "granted"
            ? {
                id: randomUUID(),
                name: entitlementGranted.name,
                version: entitlementGranted.version,
                payload: {
                  userId: change.userId,
                  scope: PLATFORM_SCOPE,
                  expiresAt: change.expiresAt.toISOString(),
                } satisfies z.input<typeof entitlementGranted.payload>,
                occurredAt,
              }
            : {
                id: randomUUID(),
                name: entitlementRevoked.name,
                version: entitlementRevoked.version,
                payload: {
                  userId: change.userId,
                  scope: PLATFORM_SCOPE,
                } satisfies z.input<typeof entitlementRevoked.payload>,
                occurredAt,
              },
      });
    }
  },
});
