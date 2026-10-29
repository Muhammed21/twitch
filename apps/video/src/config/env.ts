import { z } from "zod";

const SERVICE_SECRET_MIN_LENGTH = 32;

const envSchema = z.object({
  VIDEO_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  VIDEO_SERVICE_SECRET: z.string().min(SERVICE_SECRET_MIN_LENGTH),
  VIDEO_INGEST_URL: z.url({ protocol: /^rtmps?$/ }).default("rtmp://127.0.0.1:1935/live"),
});

export type VideoConfig = {
  readonly httpPort: number;
  readonly serviceSecret: string;
  readonly ingestUrl: string;
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): VideoConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  return {
    httpPort: parsed.data.VIDEO_HTTP_PORT,
    serviceSecret: parsed.data.VIDEO_SERVICE_SECRET,
    ingestUrl: parsed.data.VIDEO_INGEST_URL,
  };
};
