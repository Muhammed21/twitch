import { err, ok, type Result } from "@repo/result";

export const MAX_CHANNEL_TAGS = 10;
export const MAX_CHANNEL_TAG_LENGTH = 25;

export const CHANNEL_LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ja",
  "ko",
  "zh",
  "ru",
  "pl",
  "tr",
] as const;

export type ChannelLanguage = (typeof CHANNEL_LANGUAGES)[number];

export const CONTENT_LABELS = [
  "sexual_themes",
  "drugs_intoxication_tobacco",
  "gambling",
  "violent_graphic",
  "profanity",
  "mature_rated_games",
  "politics_sensitive",
] as const;

export type ContentLabel = (typeof CONTENT_LABELS)[number];

export type ChannelTag = string & { readonly __brand: "ChannelTag" };

const MAX_MARKS_PER_CHARACTER = 3;

const CHARACTER_FORMAT = new RegExp(`^[\\p{L}\\p{N}]\\p{M}{0,${MAX_MARKS_PER_CHARACTER}}$`, "u");

const graphemes = new Intl.Segmenter();

const normalizedTag = (raw: string): string =>
  raw
    .trim()
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase();

const isTag = (value: string): value is ChannelTag => {
  const characters = Array.from(graphemes.segment(value), ({ segment }) => segment);
  return (
    characters.length >= 1 &&
    characters.length <= MAX_CHANNEL_TAG_LENGTH &&
    characters.every((character) => CHARACTER_FORMAT.test(character))
  );
};

const isUnique = (tags: readonly string[]): boolean => new Set(tags).size === tags.length;

export const parseChannelTags = (
  raw: readonly string[],
): Result<readonly ChannelTag[], "invalid_tags"> => {
  const tags = raw.map(normalizedTag).filter(isTag);
  return tags.length === raw.length && tags.length <= MAX_CHANNEL_TAGS && isUnique(tags)
    ? ok(tags)
    : err("invalid_tags");
};

export const contentLabelsOf = (chosen: readonly ContentLabel[]): readonly ContentLabel[] =>
  CONTENT_LABELS.filter((label) => chosen.includes(label));
