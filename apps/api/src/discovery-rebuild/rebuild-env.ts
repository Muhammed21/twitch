import { z } from "zod";

import { parseVariables } from "../platform/config/env.ts";

const envSchema = z.object({
  DATABASE_URL_PROJECTION_REBUILD: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
});

export type RebuildConfig = { readonly historyDatabaseUrl: string };

export const loadRebuildEnv = (
  env: Readonly<Record<string, string | undefined>>,
): RebuildConfig => ({
  historyDatabaseUrl: parseVariables(envSchema, env).DATABASE_URL_PROJECTION_REBUILD,
});
