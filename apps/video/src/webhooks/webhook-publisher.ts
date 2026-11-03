import { createHmac } from "node:crypto";

import type { OutboxPublisher } from "@repo/db";

const DEFAULT_TIMEOUT_MS = 10_000;

export const signWebhook = ({
  secret,
  body,
  at,
}: {
  secret: string;
  body: Buffer;
  at: Date;
}): string => {
  const timestamp = String(Math.floor(at.getTime() / 1000));
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
  return `t=${timestamp},v1=${digest}`;
};

export const webhookPublisher =
  ({
    url,
    secret,
    now,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: {
    url: string;
    secret: string;
    now: () => Date;
    timeoutMs?: number | undefined;
  }): OutboxPublisher =>
  async (event) => {
    const body = Buffer.from(JSON.stringify(event.payload));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-video-signature": signWebhook({ secret, body, at: now() }),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    await response.body?.cancel();
    if (!response.ok) {
      throw new Error(`webhook refusé par l'API : ${response.status}`);
    }
  };
