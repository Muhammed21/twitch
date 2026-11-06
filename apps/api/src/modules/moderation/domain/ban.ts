import { err, ok, type Result } from "@repo/result";

export const MAX_BAN_MINUTES = 365 * 24 * 60;

export const MAX_BAN_REASON_LENGTH = 500;

export type BanTerm = (number & { readonly __brand: "BanMinutes" }) | null;

export type BanReason = string & { readonly __brand: "BanReason" };

const isBanTerm = (minutes: number | null): minutes is BanTerm =>
  minutes === null || (Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_BAN_MINUTES);

export const parseBanTerm = (minutes: number | null): Result<BanTerm, "invalid_duration"> =>
  isBanTerm(minutes) ? ok(minutes) : err("invalid_duration");

const isBanReason = (reason: string): reason is BanReason =>
  reason.length >= 1 && reason.length <= MAX_BAN_REASON_LENGTH;

export const parseBanReason = (reason: string): Result<BanReason, "invalid_reason"> => {
  const trimmed = reason.trim();
  return isBanReason(trimmed) ? ok(trimmed) : err("invalid_reason");
};

export const banEnd = ({ issuedAt, term }: { issuedAt: Date; term: BanTerm }): Date | null =>
  term === null ? null : new Date(issuedAt.getTime() + term * 60_000);
