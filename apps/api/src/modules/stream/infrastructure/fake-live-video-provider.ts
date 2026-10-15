import { createHmac } from "node:crypto";

import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import { signWebhook, verifyWebhookSignature } from "../../../platform/webhook-signature.ts";
import type {
  LiveVideoProviderPort,
  RawWebhook,
  WebhookError,
} from "../application/live-video-provider.ts";
import type { ProviderLifecycleEvent } from "../application/record-stream-lifecycle.ts";

const LifecycleWebhook = z.object({
  id: z.uuid(),
  type: z.enum(["stream.started", "stream.ended"]),
  channelId: z.string().min(1),
  sessionId: z.string().min(1),
  occurredAt: z.iso.datetime(),
});

type LifecycleWebhookEvent = Omit<z.input<typeof LifecycleWebhook>, "occurredAt"> & {
  readonly occurredAt: Date;
};

const readJson = (body: Buffer): { readonly value: unknown } | null => {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    return { value };
  } catch {
    return null;
  }
};

const PROVIDER_CHANNEL_PREFIX = "fake-";
const INGEST_URL = "rtmp://127.0.0.1:1935/live";

const parseLifecycleWebhook = ({
  webhookSecret,
  raw: { body, signature, receivedAt },
}: {
  webhookSecret: string;
  raw: RawWebhook;
}): Result<ProviderLifecycleEvent, WebhookError> => {
  const verified = verifyWebhookSignature({
    secret: webhookSecret,
    body,
    header: signature,
    now: receivedAt,
  });
  if (!verified.ok) {
    return verified;
  }
  const parsed = LifecycleWebhook.safeParse(readJson(body)?.value);
  if (!parsed.success) {
    return err("malformed_payload");
  }
  const { id, type, channelId, sessionId, occurredAt } = parsed.data;
  return ok({
    eventId: id,
    kind: type === "stream.started" ? "started" : "ended",
    providerChannelId: channelId,
    providerSessionId: sessionId,
    occurredAt: new Date(occurredAt),
  });
};

export const fakeLiveVideoProvider = ({
  webhookSecret,
}: {
  webhookSecret: string;
}): LiveVideoProviderPort => {
  const state: { live: readonly string[] } = { live: [] };
  const track = ({ kind, providerSessionId }: ProviderLifecycleEvent): void => {
    const others = state.live.filter((id) => id !== providerSessionId);
    state.live = kind === "started" ? [...others, providerSessionId] : others;
  };
  return {
    provisionChannel: async ({ channelId }) => ({
      providerChannelId: `${PROVIDER_CHANNEL_PREFIX}${channelId}`,
    }),
    getStreamKey: async ({ providerChannelId }) =>
      providerChannelId.startsWith(PROVIDER_CHANNEL_PREFIX)
        ? {
            streamKey: `sk_live_${createHmac("sha256", webhookSecret)
              .update(`stream-key:${providerChannelId}`)
              .digest("hex")
              .slice(0, 32)}`,
            ingestUrl: INGEST_URL,
          }
        : null,
    parseLifecycleWebhook: (raw) => {
      const parsed = parseLifecycleWebhook({ webhookSecret, raw });
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
