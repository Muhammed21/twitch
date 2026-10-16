import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL_HEALTH: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  VIDEO_WEBHOOK_SECRET: z.string().min(32),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  SMTP_FROM: z.string().min(1).default("Twitch <no-reply@twitch.local>"),
});

export const parseVariables = <T>(
  schema: z.ZodType<T>,
  env: Readonly<Record<string, string | undefined>>,
): T => {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  return parsed.data;
};

export type AppConfig = {
  readonly port: number;
  readonly databaseUrlHealth: string;
  readonly authSecret: string;
  readonly authBaseUrl: string;
  readonly redisUrl: string;
  readonly videoWebhookSecret: string;
  readonly smtp: { readonly host: string; readonly port: number; readonly from: string };
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): AppConfig => {
  const variables = parseVariables(envSchema, env);
  return {
    port: variables.API_PORT,
    databaseUrlHealth: variables.DATABASE_URL_HEALTH,
    authSecret: variables.BETTER_AUTH_SECRET,
    authBaseUrl: variables.BETTER_AUTH_URL,
    redisUrl: variables.REDIS_URL,
    videoWebhookSecret: variables.VIDEO_WEBHOOK_SECRET,
    smtp: { host: variables.SMTP_HOST, port: variables.SMTP_PORT, from: variables.SMTP_FROM },
  };
};
