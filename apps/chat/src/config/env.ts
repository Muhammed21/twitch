import { z } from "zod";

const envSchema = z.object({
  CHAT_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CHAT_API_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:3000"),
  CHAT_API_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  CHAT_SATURATION_MAX_PACKETS: z.coerce.number().int().min(1).default(100),
  CHAT_SATURATION_CLOSE_AFTER_MS: z.coerce.number().int().min(1).default(10_000),
});

export type ChatConfig = {
  readonly httpPort: number;
  readonly redisUrl: string;
  readonly accessTokens: {
    readonly jwksUrl: string;
    readonly issuer: string;
    readonly audience: string;
  };
  readonly saturation: { readonly maxPackets: number; readonly closeAfterMs: number };
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): ChatConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  const apiUrl = (path: string) => new URL(path, parsed.data.CHAT_API_BASE_URL).href;
  return {
    httpPort: parsed.data.CHAT_HTTP_PORT,
    redisUrl: parsed.data.REDIS_URL,
    accessTokens: {
      jwksUrl: parsed.data.CHAT_API_JWKS_URL ?? apiUrl("/auth/jwks"),
      issuer: apiUrl("/auth"),
      audience: apiUrl("/v1"),
    },
    saturation: {
      maxPackets: parsed.data.CHAT_SATURATION_MAX_PACKETS,
      closeAfterMs: parsed.data.CHAT_SATURATION_CLOSE_AFTER_MS,
    },
  };
};
