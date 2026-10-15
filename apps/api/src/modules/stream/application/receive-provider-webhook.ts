import { ok, type Result } from "@repo/result";

import type { LiveVideoProviderPort, RawWebhook, WebhookError } from "./live-video-provider.ts";
import type { LifecycleOutcome, ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

export const receiveProviderWebhook =
  ({
    provider,
    record,
    now,
  }: {
    provider: LiveVideoProviderPort;
    record: (event: ProviderLifecycleEvent) => Promise<LifecycleOutcome>;
    now: () => Date;
  }) =>
  async ({
    body,
    signature,
  }: Omit<RawWebhook, "receivedAt">): Promise<Result<LifecycleOutcome, WebhookError>> => {
    const parsed = provider.parseLifecycleWebhook({ body, signature, receivedAt: now() });
    if (!parsed.ok) {
      return parsed;
    }
    return ok(await record(parsed.value));
  };
