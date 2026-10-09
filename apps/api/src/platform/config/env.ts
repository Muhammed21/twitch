import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL_HEALTH: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
});

export type AppConfig = {
  readonly port: number;
  readonly databaseUrlHealth: string;
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): AppConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  return { port: parsed.data.API_PORT, databaseUrlHealth: parsed.data.DATABASE_URL_HEALTH };
};
