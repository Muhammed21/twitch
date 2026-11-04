import { err, ok, type Result } from "@repo/result";

export const MAX_BIO_LENGTH = 300;

const MAX_BIO_CODE_UNITS = MAX_BIO_LENGTH * 10;

export type ProfileBio = string & { readonly __brand: "ProfileBio" };

const graphemes = new Intl.Segmenter();

const isWithinLength = (value: string): value is ProfileBio =>
  value.length <= MAX_BIO_CODE_UNITS &&
  Array.from(graphemes.segment(value)).length <= MAX_BIO_LENGTH;

export const parseBio = (raw: string): Result<ProfileBio, "bio_too_long"> => {
  const trimmed = raw.trim();
  return isWithinLength(trimmed) ? ok(trimmed) : err("bio_too_long");
};
