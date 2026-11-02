import { createHmac } from "node:crypto";

import { signWebhook } from "../../../platform/webhook-signature.ts";
import type { LiveVideoProviderPort, ProviderWebhook } from "../application/live-video-provider.ts";
import { parseVideoWebhook } from "./video-webhook.ts";

type LifecycleWebhookEvent = {
  readonly id: string;
  readonly type: "stream.started" | "stream.ended";
  readonly channelId: string;
  readonly sessionId: string;
  readonly occurredAt: Date;
};

const PROVIDER_CHANNEL_PREFIX = "fake-";
const INGEST_URL = "rtmp://127.0.0.1:1935/live";

export const fakeLiveVideoProvider = ({
  webhookSecret,
}: {
  webhookSecret: string;
}): LiveVideoProviderPort => {
  const state: { live: readonly string[]; generations: Readonly<Record<string, number>> } = {
    live: [],
    generations: {},
  };
  const generationOf = (providerChannelId: string): number =>
    state.generations[providerChannelId] ?? 0;
  const track = (webhook: ProviderWebhook): void => {
    if (webhook.kind === "ignored") {
      return;
    }
    const others = state.live.filter((id) => id !== webhook.providerSessionId);
    state.live = webhook.kind === "started" ? [...others, webhook.providerSessionId] : others;
  };
  return {
    provisionChannel: async ({ channelId }) => ({
      providerChannelId: `${PROVIDER_CHANNEL_PREFIX}${channelId}`,
    }),
    getStreamKey: async ({ providerChannelId }) =>
      providerChannelId.startsWith(PROVIDER_CHANNEL_PREFIX)
        ? {
            streamKey: `sk_live_${createHmac("sha256", webhookSecret)
              .update(`stream-key:${providerChannelId}:${generationOf(providerChannelId)}`)
              .digest("hex")
              .slice(0, 32)}`,
            ingestUrl: INGEST_URL,
          }
        : null,
    revokeStreamKey: async ({ providerChannelId }) => {
      state.generations = {
        ...state.generations,
        [providerChannelId]: generationOf(providerChannelId) + 1,
      };
    },
    parseLifecycleWebhook: (raw) => {
      const parsed = parseVideoWebhook({ webhookSecret, raw });
      if (parsed.ok) {
        track(parsed.value);
      }
      return parsed;
    },
    listLiveSessions: async () => state.live.map((providerSessionId) => ({ providerSessionId })),
  };
};

export const fakeLifecycleWebhook = ({
  secret,
  event,
  at = new Date(),
}: {
  secret: string;
  event: LifecycleWebhookEvent;
  at?: Date;
}): { readonly body: string; readonly signature: string } => {
  const body = JSON.stringify({ ...event, occurredAt: event.occurredAt.toISOString() });
  return { body, signature: signWebhook({ secret, body: Buffer.from(body), at }) };
};
