import type { createContextClient } from "@repo/db";

import type { WebhookInbox } from "../application/receive-revenuecat-webhook.ts";

export type MonetizationPrisma = ReturnType<typeof createContextClient>;

const NUL = "\u0000";

export const prismaWebhookInbox = ({
  prisma,
  provider,
  newId,
}: {
  prisma: MonetizationPrisma;
  provider: string;
  newId: () => string;
}): WebhookInbox => ({
  record: async ({ eventId, payload }) => {
    const inserted = await prisma.$executeRaw`
      INSERT INTO "monetization"."MonetizationProcessedWebhookEvent" ("provider", "eventId", "payload")
      VALUES (${provider}, ${eventId}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT DO NOTHING`;
    return inserted === 0 ? "duplicate" : "recorded";
  },
  reject: async ({ reason, body }) => {
    await prisma.monetizationRejectedWebhook.create({
      data: { id: newId(), provider, reason, body: body.replaceAll(NUL, "") },
    });
  },
});
