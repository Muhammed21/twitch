import { err, ok, type Result } from "@repo/result";

const SLUG_FORMAT = /^[a-z0-9_]{4,25}$/;
const MAX_LENGTH = 25;
const FALLBACK_BASE = "user";
const NUMBERED_SUFFIXES = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => `_${n}`);
const ACCOUNT_SUFFIX_LENGTH = 12;

export const RESERVED_SLUGS: readonly string[] = [
  "admin",
  "api",
  "auth",
  "directory",
  "help",
  "login",
  "logout",
  "moderator",
  "privacy",
  "search",
  "settings",
  "signup",
  "staff",
  "support",
  "terms",
  "twitch",
  "well_known",
];

export type ChannelSlug = string & { readonly __brand: "ChannelSlug" };

export type ChannelSlugError = "malformed" | "reserved";

const isWellFormed = (value: string): value is ChannelSlug => SLUG_FORMAT.test(value);

export const parseChannelSlug = (value: string): Result<ChannelSlug, ChannelSlugError> => {
  if (RESERVED_SLUGS.includes(value)) {
    return err("reserved");
  }
  return isWellFormed(value) ? ok(value) : err("malformed");
};

const trimSeparators = (value: string): string => value.replace(/^_|_$/g, "");

const normalize = (displayName: string): string =>
  trimSeparators(
    trimSeparators(
      displayName
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_"),
    ).slice(0, MAX_LENGTH),
  ) || FALLBACK_BASE;

const withSuffix = (base: string, suffix: string): string =>
  `${trimSeparators(base.slice(0, MAX_LENGTH - suffix.length))}${suffix}`;

export const slugCandidates = ({
  displayName,
  accountId,
}: {
  displayName: string;
  accountId: string;
}): readonly ChannelSlug[] => {
  const base = normalize(displayName);
  const accountSuffix = `_${accountId.replaceAll("-", "").slice(0, ACCOUNT_SUFFIX_LENGTH)}`;
  return [base, ...[...NUMBERED_SUFFIXES, accountSuffix].map((suffix) => withSuffix(base, suffix))]
    .map(parseChannelSlug)
    .flatMap((candidate) => (candidate.ok ? [candidate.value] : []));
};

export const firstFreeSlug = ({
  candidates,
  taken,
}: {
  candidates: readonly ChannelSlug[];
  taken: ReadonlySet<string>;
}): ChannelSlug | null => candidates.find((candidate) => !taken.has(candidate)) ?? null;
