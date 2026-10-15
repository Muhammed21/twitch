import type { Result } from "@repo/result";

import type { ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

export type RawWebhook = {
  readonly body: Buffer;
  readonly signature: string | undefined;
  readonly receivedAt: Date;
};

export type WebhookError = "invalid_signature" | "malformed_payload";

export interface LiveVideoProviderPort {
  parseLifecycleWebhook(raw: RawWebhook): Result<ProviderLifecycleEvent, WebhookError>;
}
