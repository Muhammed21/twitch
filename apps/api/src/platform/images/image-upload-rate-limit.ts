import { fixedWindowLimiter, type RateDecision, type WindowCounter } from "../rate-limit.ts";

const WINDOW_MS = 600_000;
const PREPARATIONS_PER_USER = 20;

export const imageUploadRateLimit = ({
  counter,
  now,
}: {
  counter: WindowCounter;
  now: () => Date;
}): ((userId: string) => Promise<RateDecision>) => {
  const perUser = fixedWindowLimiter({
    counter,
    name: "images:upload",
    limit: PREPARATIONS_PER_USER,
    windowMs: WINDOW_MS,
  });
  return (userId) => perUser(userId, now());
};
