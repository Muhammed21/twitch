import { err, ok, type Result } from "@repo/result";

export const MAX_TITLE_LENGTH = 140;

export type ChannelTitle = string & { readonly __brand: "ChannelTitle" };

const graphemes = new Intl.Segmenter();

const isWithinLength = (value: string): value is ChannelTitle =>
  Array.from(graphemes.segment(value)).length <= MAX_TITLE_LENGTH;

export const parseChannelTitle = (raw: string): Result<ChannelTitle, "title_too_long"> => {
  const trimmed = raw.trim();
  return isWithinLength(trimmed) ? ok(trimmed) : err("title_too_long");
};
