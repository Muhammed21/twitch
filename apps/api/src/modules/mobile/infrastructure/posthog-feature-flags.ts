import { z } from "zod";

import type { FeatureFlags } from "../application/read-bootstrap.ts";

const EVALUATION_TIMEOUT_MS = 500;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === "TimeoutError";

const FlagsResponse = z.looseObject({
  flags: z.record(
    z.string(),
    z.looseObject({ enabled: z.boolean(), variant: z.string().nullable().optional() }),
  ),
});

export const posthogFeatureFlags = ({
  host,
  apiKey,
}: {
  host: string;
  apiKey: string;
}): FeatureFlags => ({
  evaluate: async (distinctId) => {
    const response = await fetch(new URL("/flags/?v=2", host), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, distinct_id: distinctId }),
      signal: AbortSignal.timeout(EVALUATION_TIMEOUT_MS),
    }).catch((error: unknown) => {
      if (isTimeout(error)) {
        throw new Error(
          `PostHog : POST /flags sans réponse dans le délai de ${EVALUATION_TIMEOUT_MS} ms`,
        );
      }
      throw error;
    });
    if (!response.ok) {
      throw new Error(`PostHog : POST /flags a répondu ${response.status}`);
    }
    const parsed = FlagsResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("PostHog : réponse de /flags hors du format attendu");
    }
    return Object.fromEntries(
      Object.entries(parsed.data.flags).map(([key, { enabled, variant }]) => [
        key,
        variant ?? enabled,
      ]),
    );
  },
});
