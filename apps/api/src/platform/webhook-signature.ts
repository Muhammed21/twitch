import { createHmac, timingSafeEqual } from "node:crypto";

import { err, ok, type Result } from "@repo/result";

export const WEBHOOK_TOLERANCE_SECONDS = 300;

const TIMESTAMP = /^\d+$/;
const SIGNATURE = /^[0-9a-f]{64}$/;

const digest = ({ secret, timestamp, body }: { secret: string; timestamp: string; body: Buffer }) =>
  createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest();

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
  return `t=${timestamp},v1=${digest({ secret, timestamp, body }).toString("hex")}`;
};

const parseHeader = (header: string) => {
  const pairs = header.split(",").map((part) => part.trim().split("="));
  const timestamp = String(pairs.find(([key]) => key === "t")?.[1]);
  const signatures = pairs
    .map(([key, value]) => ({ key, value: String(value) }))
    .filter(({ key, value }) => key === "v1" && SIGNATURE.test(value))
    .map(({ value }) => Buffer.from(value, "hex"));
  return { timestamp, signatures };
};

export const verifyWebhookSignature = ({
  secret,
  body,
  header,
  now,
}: {
  secret: string;
  body: Buffer;
  header: string | undefined;
  now: Date;
}): Result<void, "invalid_signature"> => {
  const { timestamp, signatures } = parseHeader(String(header));
  if (!TIMESTAMP.test(timestamp)) {
    return err("invalid_signature");
  }
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) {
    return err("invalid_signature");
  }
  const expected = digest({ secret, timestamp, body });
  return signatures.some((signature) => timingSafeEqual(signature, expected))
    ? ok(undefined)
    : err("invalid_signature");
};
