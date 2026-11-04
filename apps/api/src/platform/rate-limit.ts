import { ProblemException } from "./problem.ts";

export type WindowCounter = (key: string, ttlMs: number) => Promise<number>;

export type RateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

export type RateLimiter = (subject: string, now: Date) => Promise<RateDecision>;

const ALLOWED: RateDecision = { allowed: true };

export const fixedWindowLimiter =
  ({
    counter,
    name,
    limit,
    windowMs,
  }: {
    counter: WindowCounter;
    name: string;
    limit: number;
    windowMs: number;
  }): RateLimiter =>
  async (subject, now) => {
    const window = Math.floor(now.getTime() / windowMs);
    const count = await counter(`ratelimit:${name}:${subject}:${window}`, windowMs);
    if (count <= limit) {
      return ALLOWED;
    }
    const remainingMs = (window + 1) * windowMs - now.getTime();
    return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
  };

export const mostRestrictive = (decisions: readonly RateDecision[]): RateDecision => {
  const waits = decisions.flatMap((decision) =>
    decision.allowed ? [] : [decision.retryAfterSeconds],
  );
  return waits.length === 0 ? ALLOWED : { allowed: false, retryAfterSeconds: Math.max(...waits) };
};

export const tooManyRequests = (retryAfterSeconds: number): ProblemException =>
  new ProblemException({
    status: 429,
    title: "Trop de requêtes",
    detail: `Réessayez dans ${retryAfterSeconds} s.`,
    headers: { "retry-after": String(retryAfterSeconds) },
  });
