import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import { type Context, contextSchema } from "./contexts.ts";
import { PrismaClient } from "./generated/prisma/client.ts";

type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_POOL_MAX = 5;

const postgresUrlSchema = z.string().regex(/^postgres(ql)?:\/\/\S+$/);

const poolMaxSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number);

const parseContext = (context: Context): Context => {
  const parsed = contextSchema.safeParse(context);
  if (!parsed.success) {
    throw new Error(`Contexte inconnu : ${context}`);
  }
  return parsed.data;
};

const parseVariable = <T>({
  env,
  variable,
  schema,
}: {
  env: Env;
  variable: string;
  schema: z.ZodType<T, string>;
}): T => {
  const parsed = schema.safeParse(env[variable]);
  if (!parsed.success) {
    throw new Error(`${variable} est absente ou invalide`);
  }
  return parsed.data;
};

export const readContextDatabaseConfig = ({ context, env }: { context: Context; env: Env }) => {
  const suffix = parseContext(context).toUpperCase();
  const poolVariable = `DATABASE_POOL_MAX_${suffix}`;
  return {
    url: parseVariable({ env, variable: `DATABASE_URL_${suffix}`, schema: postgresUrlSchema }),
    poolMax:
      env[poolVariable] === undefined
        ? DEFAULT_POOL_MAX
        : parseVariable({ env, variable: poolVariable, schema: poolMaxSchema }),
  };
};

export const createContextClient = ({
  context,
  env = process.env,
}: {
  context: Context;
  env?: Env;
}): PrismaClient => {
  const { url, poolMax } = readContextDatabaseConfig({ context, env });
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: poolMax }) });
};
