import type { RateLimit } from "../application/ports.ts";
import { withDeadline } from "./deadline.ts";

const SHARED_RATE_LIMIT_DEADLINE_MS = 200;

export const sharedRateLimit = ({
  shared,
  local,
  onFallback,
}: {
  shared: RateLimit;
  local: RateLimit;
  onFallback: (error: unknown) => void;
}): RateLimit => ({
  take: (request) =>
    withDeadline(shared.take(request), SHARED_RATE_LIMIT_DEADLINE_MS).catch((error: unknown) => {
      onFallback(error);
      return local.take(request);
    }),
});
