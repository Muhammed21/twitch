import { randomUUID } from "node:crypto";

import { type BetterAuthPlugin, getCurrentAdapter } from "better-auth";

import { events } from "@repo/contracts";

const { accountRegistered } = events.identity;

export const identityOutbox = (): BetterAuthPlugin => ({
  id: "identity-outbox",
  schema: {
    identityOutbox: {
      fields: {
        name: { type: "string" },
        version: { type: "number" },
        payload: { type: "string" },
        occurredAt: { type: "date" },
      },
    },
  },
  init: (context) => ({
    options: {
      databaseHooks: {
        user: {
          create: {
            before: async (user) => {
              const accountId = randomUUID();
              await (
                await getCurrentAdapter(context.adapter)
              ).create({
                model: "identityOutbox",
                data: {
                  name: accountRegistered.name,
                  version: accountRegistered.version,
                  payload: accountRegistered.payload.parse({ accountId }),
                  occurredAt: new Date(),
                },
              });
              return { data: { ...user, id: accountId } };
            },
          },
        },
      },
    },
  }),
});
