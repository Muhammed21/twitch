import { ok, type Result } from "@repo/result";

import type { LiveVideoProviderPort, RawWebhook, WebhookError } from "./live-video-provider.ts";
import type { LifecycleOutcome, ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

export type WebhookOutcome = LifecycleOutcome | { readonly status: "ignored" };

export const receiveProviderWebhook =
  ({
    provider,
    record,
    now,
  }: {
    provider: Pick<LiveVideoProviderPort, "parseLifecycleWebhook">;
    record: (event: ProviderLifecycleEvent) => Promise<LifecycleOutcome>;
    now: () => Date;
  }) =>
  async ({
    body,
    signature,
  }: Omit<RawWebhook, "receivedAt">): Promise<Result<WebhookOutcome, WebhookError>> => {
    const parsed = provider.parseLifecycleWebhook({ body, signature, receivedAt: now() });
    if (!parsed.ok) {
      return parsed;
    }
    if (parsed.value.kind === "ignored") {
      return ok({ status: "ignored" });
    }
    return ok(await record(parsed.value));
  };
