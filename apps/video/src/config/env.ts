import { z } from "zod";

const SERVICE_SECRET_MIN_LENGTH = 32;
const ENCRYPTION_KEY_BYTES = 32;
const WEBHOOK_SECRET_MIN_LENGTH = 32;

const envSchema = z.object({
  VIDEO_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
  VIDEO_RTMP_PORT: z.coerce.number().int().min(0).max(65_535).default(1935),
  VIDEO_SERVICE_SECRET: z.string().min(SERVICE_SECRET_MIN_LENGTH),
  VIDEO_INGEST_URL: z.url({ protocol: /^rtmps?$/ }).default("rtmp://127.0.0.1:1935/live"),
  VIDEO_STREAM_KEY_ENCRYPTION_KEY: z
    .base64()
    .transform((value) => Uint8Array.from(Buffer.from(value, "base64")))
    .refine((key) => key.length === ENCRYPTION_KEY_BYTES),
  VIDEO_WEBHOOK_URL: z
    .url({ protocol: /^https?$/ })
    .default("http://127.0.0.1:3000/v1/webhooks/video"),
  VIDEO_WEBHOOK_SECRET: z.string().min(WEBHOOK_SECRET_MIN_LENGTH),
  DATABASE_URL_OUTBOX_RELAY: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(1).default(1000),
});

export type VideoConfig = {
  readonly httpPort: number;
  readonly rtmpPort: number;
  readonly serviceSecret: string;
  readonly ingestUrl: string;
  readonly streamKeyEncryptionKey: Uint8Array;
  readonly webhook: { readonly url: string; readonly secret: string };
  readonly outboxRelay: { readonly databaseUrl: string; readonly intervalMs: number };
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): VideoConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  return {
    httpPort: parsed.data.VIDEO_HTTP_PORT,
    rtmpPort: parsed.data.VIDEO_RTMP_PORT,
    serviceSecret: parsed.data.VIDEO_SERVICE_SECRET,
    ingestUrl: parsed.data.VIDEO_INGEST_URL,
    streamKeyEncryptionKey: parsed.data.VIDEO_STREAM_KEY_ENCRYPTION_KEY,
    webhook: { url: parsed.data.VIDEO_WEBHOOK_URL, secret: parsed.data.VIDEO_WEBHOOK_SECRET },
    outboxRelay: {
      databaseUrl: parsed.data.DATABASE_URL_OUTBOX_RELAY,
      intervalMs: parsed.data.OUTBOX_RELAY_INTERVAL_MS,
    },
  };
};
