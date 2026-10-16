import { err, ok, type Result } from "@repo/result";

export const MAX_TIMEOUT_SECONDS = 14 * 24 * 60 * 60;

export type TimeoutDuration = number & { readonly __brand: "TimeoutDuration" };

const isTimeoutDuration = (seconds: number): seconds is TimeoutDuration =>
  Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_TIMEOUT_SECONDS;

export const parseTimeoutDuration = (
  seconds: number,
): Result<TimeoutDuration, "invalid_duration"> =>
  isTimeoutDuration(seconds) ? ok(seconds) : err("invalid_duration");

export const timeoutEnd = ({
  issuedAt,
  duration,
}: {
  issuedAt: Date;
  duration: TimeoutDuration;
}): Date => new Date(issuedAt.getTime() + duration * 1000);
