import { z } from "zod";

import { parseVariables } from "../platform/config/env.ts";

const envSchema = z.object({
  DATABASE_URL_OUTBOX_RELAY: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(1).default(1000),
});

export type RelayConfig = {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly intervalMs: number;
};

export const loadRelayEnv = (env: Readonly<Record<string, string | undefined>>): RelayConfig => {
  const variables = parseVariables(envSchema, env);
  return {
    databaseUrl: variables.DATABASE_URL_OUTBOX_RELAY,
    redisUrl: variables.REDIS_URL,
    intervalMs: variables.OUTBOX_RELAY_INTERVAL_MS,
  };
};
