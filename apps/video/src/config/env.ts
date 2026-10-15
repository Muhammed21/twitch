import { z } from "zod";

const envSchema = z.object({
  VIDEO_HTTP_PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
});

export type VideoConfig = {
  readonly httpPort: number;
};

export const loadEnv = (env: Readonly<Record<string, string | undefined>>): VideoConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Configuration invalide, variables à corriger : ${variables.join(", ")}`);
  }
  return { httpPort: parsed.data.VIDEO_HTTP_PORT };
};
