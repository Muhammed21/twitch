import {
  fixedWindowLimiter,
  mostRestrictive,
  type RateDecision,
  type WindowCounter,
} from "../../../platform/rate-limit.ts";

export const PRESENCE_RATE_LIMIT = Symbol("PRESENCE_RATE_LIMIT");

export type PresenceRateLimit = (heartbeat: {
  ip: string;
  channelId: string;
}) => Promise<RateDecision>;

const WINDOW_MS = 60_000;
const HEARTBEATS_PER_CHANNEL = 4;
const HEARTBEATS_PER_IP = 60;

export const presenceRateLimit = ({
  counter,
  now,
}: {
  counter: WindowCounter;
  now: () => Date;
}): PresenceRateLimit => {
  const perChannel = fixedWindowLimiter({
    counter,
    name: "presence:channel",
    limit: HEARTBEATS_PER_CHANNEL,
    windowMs: WINDOW_MS,
  });
  const perIp = fixedWindowLimiter({
    counter,
    name: "presence:ip",
    limit: HEARTBEATS_PER_IP,
    windowMs: WINDOW_MS,
  });
  return async ({ ip, channelId }) => {
    const at = now();
    return mostRestrictive(
      await Promise.all([perChannel(`${ip}:${channelId}`, at), perIp(ip, at)]),
    );
  };
};
