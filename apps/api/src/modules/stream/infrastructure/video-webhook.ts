import { z } from "zod";

import { err, ok, type Result } from "@repo/result";
import { StreamEnded, StreamStarted, VideoEvent } from "@repo/video-contract";

import { verifyWebhookSignature } from "../../../platform/webhook-signature.ts";
import type {
  ProviderWebhook,
  RawWebhook,
  WebhookError,
} from "../application/live-video-provider.ts";

const readJson = (body: Buffer): { readonly value: unknown } | null => {
  try {
    const value: unknown = JSON.parse(body.toString("utf8"));
    return { value };
  } catch {
    return null;
  }
};

const LifecycleEvent = z.union([StreamStarted, StreamEnded]);

const decode = (json: unknown): ProviderWebhook | null => {
  const lifecycle = LifecycleEvent.safeParse(json);
  if (lifecycle.success) {
    const { id, type, channelId, sessionId, occurredAt } = lifecycle.data;
    return {
      eventId: id,
      kind: type === "stream.started" ? "started" : "ended",
      providerChannelId: channelId,
      providerSessionId: sessionId,
      occurredAt: new Date(occurredAt),
    };
  }
  const other = VideoEvent.safeParse(json);
  return other.success ? { kind: "ignored", eventId: other.data.id } : null;
};

export const parseVideoWebhook = ({
  webhookSecret,
  raw: { body, signature, receivedAt },
}: {
  webhookSecret: string;
  raw: RawWebhook;
}): Result<ProviderWebhook, WebhookError> => {
  const verified = verifyWebhookSignature({
    secret: webhookSecret,
    body,
    header: signature,
    now: receivedAt,
  });
  if (!verified.ok) {
    return verified;
  }
  const webhook = decode(readJson(body)?.value);
  return webhook === null ? err("malformed_payload") : ok(webhook);
};
