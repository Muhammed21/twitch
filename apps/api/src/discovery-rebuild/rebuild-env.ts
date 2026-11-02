import { z } from "zod";

import { parseVariables } from "../platform/config/env.ts";

const envSchema = z.object({
  DATABASE_URL_OUTBOX_RELAY: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
});

export type RebuildConfig = { readonly outboxDatabaseUrl: string };

export const loadRebuildEnv = (
  env: Readonly<Record<string, string | undefined>>,
): RebuildConfig => ({
  outboxDatabaseUrl: parseVariables(envSchema, env).DATABASE_URL_OUTBOX_RELAY,
});
