import { backoffDelay } from "@repo/db";

import type { ProcessWebhook } from "../application/process-webhook.ts";
import { prismaTurboLedger } from "./prisma-turbo-ledger.ts";
import type { MonetizationPrisma } from "./prisma-webhook-inbox.ts";

export type QueueOutcome =
  | { readonly status: "empty" }
  | { readonly status: "processed"; readonly eventId: string; readonly outcome: string }
  | { readonly status: "failed"; readonly eventId: string; readonly error: string };

type PendingRow = { eventId: string; payload: unknown; attempts: number };

const utc = (date: Date) => date.toISOString();

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const prismaWebhookQueue = ({
  prisma,
  provider,
  backoff = backoffDelay,
}: {
  prisma: MonetizationPrisma;
  provider: string;
  backoff?: (attempts: number) => number;
}) => ({
  processNext: (work: ProcessWebhook, now: Date): Promise<QueueOutcome> =>
    prisma.$transaction(async (tx): Promise<QueueOutcome> => {
      const [row] = await tx.$queryRaw<PendingRow[]>`
        SELECT "eventId", "payload", "attempts"
          FROM "monetization"."MonetizationProcessedWebhookEvent"
         WHERE "provider" = ${provider}
           AND "processedAt" IS NULL
           AND "nextAttemptAt" <= (${utc(now)}::timestamptz AT TIME ZONE 'UTC')
         ORDER BY "receivedAt", "eventId"
         LIMIT 1
         FOR UPDATE SKIP LOCKED`;
      if (row === undefined) {
        return { status: "empty" };
      }
      const key = { provider_eventId: { provider, eventId: row.eventId } };
      await tx.$executeRaw`SAVEPOINT process_webhook`;
      const result = await work(
        { eventId: row.eventId, payload: row.payload },
        prismaTurboLedger(tx),
      )
        .then((outcome) => ({ ok: true as const, outcome }))
        .catch((error: unknown) => ({ ok: false as const, error: messageOf(error) }));
      if (!result.ok) {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT process_webhook`;
        await tx.monetizationProcessedWebhookEvent.update({
          where: key,
          data: {
            attempts: row.attempts + 1,
            nextAttemptAt: new Date(now.getTime() + backoff(row.attempts + 1)),
            lastError: result.error,
          },
        });
        return { status: "failed", eventId: row.eventId, error: result.error };
      }
      await tx.monetizationProcessedWebhookEvent.update({
        where: key,
        data: { processedAt: now, outcome: result.outcome, lastError: null },
      });
      return { status: "processed", eventId: row.eventId, outcome: result.outcome };
    }),
});

export type WebhookQueue = ReturnType<typeof prismaWebhookQueue>;
