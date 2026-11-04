import { z } from "zod";

const SERVICE_SECRET_MIN_LENGTH = 32;
const MAX_TRUSTED_PROXIES = 10;

const videoSchema = z.discriminatedUnion("VIDEO_PROVIDER", [
  z.object({ VIDEO_PROVIDER: z.literal("fake") }),
  z.object({
    VIDEO_PROVIDER: z.literal("video"),
    VIDEO_SERVICE_URL: z.url({ protocol: /^https?$/ }),
    VIDEO_SERVICE_SECRET: z.string().min(SERVICE_SECRET_MIN_LENGTH),
  }),
]);

const featureFlagsSchema = z.discriminatedUnion("FEATURE_FLAGS_PROVIDER", [
  z.object({ FEATURE_FLAGS_PROVIDER: z.literal("defaults") }),
  z.object({
    FEATURE_FLAGS_PROVIDER: z.literal("posthog"),
    POSTHOG_HOST: z.url({ protocol: /^https?$/ }),
    POSTHOG_PROJECT_API_KEY: z.string().min(1),
  }),
]);

const baseSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL_HEALTH: z.string().regex(/^postgres(ql)?:\/\/\S+$/),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  VIDEO_WEBHOOK_SECRET: z.string().min(32),
  VIDEO_PLAYBACK_BASE_URL: z.url({ protocol: /^https?$/ }),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
  SMTP_FROM: z.string().min(1).default("Twitch <no-reply@twitch.local>"),
  MOBILE_MIN_SUPPORTED_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/),
  API_TRUSTED_PROXY_COUNT: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.int().max(MAX_TRUSTED_PROXIES)),
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  S3_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }),
});

const envSchema = baseSchema.and(videoSchema).and(featureFlagsSchema);

export type VideoProviderConfig =
  | { readonly provider: "fake" }
  | { readonly provider: "video"; readonly serviceUrl: string; readonly serviceSecret: string };

export type FeatureFlagsConfig =
  | { readonly provider: "defaults" }
  | { readonly provider: "posthog"; readonly host: string; readonly apiKey: string };

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

export type ImageStorageConfig = {
  readonly endpoint: string;
  readonly publicEndpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly publicBaseUrl: string;
};

export type AppConfig = {
  readonly port: number;
  readonly databaseUrlHealth: string;
  readonly authSecret: string;
  readonly authBaseUrl: string;
  readonly redisUrl: string;
  readonly videoWebhookSecret: string;
  readonly videoPlaybackBaseUrl: string;
  readonly smtp: { readonly host: string; readonly port: number; readonly from: string };
  readonly video: VideoProviderConfig;
  readonly featureFlags: FeatureFlagsConfig;
  readonly mobileMinSupportedVersion: string;
  readonly trustedProxyCount: number;
  readonly images: ImageStorageConfig;
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
    videoPlaybackBaseUrl: variables.VIDEO_PLAYBACK_BASE_URL,
    smtp: { host: variables.SMTP_HOST, port: variables.SMTP_PORT, from: variables.SMTP_FROM },
    video:
      variables.VIDEO_PROVIDER === "fake"
        ? { provider: "fake" }
        : {
            provider: "video",
            serviceUrl: variables.VIDEO_SERVICE_URL,
            serviceSecret: variables.VIDEO_SERVICE_SECRET,
          },
    featureFlags:
      variables.FEATURE_FLAGS_PROVIDER === "defaults"
        ? { provider: "defaults" }
        : {
            provider: "posthog",
            host: variables.POSTHOG_HOST,
            apiKey: variables.POSTHOG_PROJECT_API_KEY,
          },
    mobileMinSupportedVersion: variables.MOBILE_MIN_SUPPORTED_VERSION,
    trustedProxyCount: variables.API_TRUSTED_PROXY_COUNT,
    images: {
      endpoint: variables.S3_ENDPOINT,
      publicEndpoint: variables.S3_PUBLIC_ENDPOINT ?? variables.S3_ENDPOINT,
      region: variables.S3_REGION,
      bucket: variables.S3_BUCKET,
      accessKeyId: variables.S3_ACCESS_KEY_ID,
      secretAccessKey: variables.S3_SECRET_ACCESS_KEY,
      publicBaseUrl: variables.S3_PUBLIC_BASE_URL,
    },
  };
};
