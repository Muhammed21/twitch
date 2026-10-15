import { z } from "zod";

import { err, ok } from "@repo/result";

import { signWebhook, verifyWebhookSignature } from "../../../platform/webhook-signature.ts";
import type { LiveVideoProviderPort } from "../application/live-video-provider.ts";

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

export const fakeLiveVideoProvider = ({
  webhookSecret,
}: {
  webhookSecret: string;
}): LiveVideoProviderPort => ({
  parseLifecycleWebhook: ({ body, signature, receivedAt }) => {
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
  },
});

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
