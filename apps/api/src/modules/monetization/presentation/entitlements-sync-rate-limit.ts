import {
  fixedWindowLimiter,
  type RateDecision,
  type WindowCounter,
} from "../../../platform/rate-limit.ts";

const WINDOW_MS = 600_000;
const SYNCS_PER_USER = 10;

export const entitlementsSyncRateLimit = ({
  counter,
  now,
}: {
  counter: WindowCounter;
  now: () => Date;
}): ((userId: string) => Promise<RateDecision>) => {
  const perUser = fixedWindowLimiter({
    counter,
    name: "monetization:sync",
    limit: SYNCS_PER_USER,
    windowMs: WINDOW_MS,
  });
  return (userId) => perUser(userId, now());
};
