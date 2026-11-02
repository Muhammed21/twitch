import type { Result } from "@repo/result";

import type { ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

export type RawWebhook = {
  readonly body: Buffer;
  readonly signature: string | undefined;
  readonly receivedAt: Date;
};

export type WebhookError = "invalid_signature" | "malformed_payload";

export type StreamCredentials = {
  readonly streamKey: string;
  readonly ingestUrl: string;
};

export type ProviderWebhook =
  | ProviderLifecycleEvent
  | { readonly kind: "ignored"; readonly eventId: string };

export type LiveSession = { readonly providerSessionId: string };

export interface LiveVideoProviderPort {
  provisionChannel(input: { channelId: string }): Promise<{ providerChannelId: string }>;
  getStreamKey(input: { providerChannelId: string }): Promise<StreamCredentials | null>;
  revokeStreamKey(input: { providerChannelId: string }): Promise<void>;
  parseLifecycleWebhook(raw: RawWebhook): Result<ProviderWebhook, WebhookError>;
  listLiveSessions(): Promise<readonly LiveSession[]>;
}
