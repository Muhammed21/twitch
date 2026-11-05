import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { ReceivedWebhook } from "../application/receive-revenuecat-webhook.ts";

const MAX_EVENT_ID_LENGTH = 128;

const Envelope = z.looseObject({
  api_version: z.string().min(1),
  event: z.looseObject({
    id: z.string().min(1).max(MAX_EVENT_ID_LENGTH),
    type: z.string().min(1),
    event_timestamp_ms: z.int().nonnegative(),
  }),
});

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();

export const authorizationMatches = ({
  expected,
  received,
}: {
  expected: string;
  received: string | undefined;
}): boolean => received !== undefined && timingSafeEqual(sha256(expected), sha256(received));

const parseJson = (body: Buffer): unknown => {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    return undefined;
  }
};

export const readRevenueCatWebhook = (body: Buffer): ReceivedWebhook | null => {
  const parsed = Envelope.safeParse(parseJson(body));
  return parsed.success ? { eventId: parsed.data.event.id, payload: parsed.data } : null;
};
