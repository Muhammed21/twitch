import { err, ok, type Result } from "@repo/result";

export const MAX_CATEGORY_SLUG_LENGTH = 50;
export const MAX_CATEGORY_NAME_LENGTH = 50;

export type CategorySlug = string & { readonly __brand: "CategorySlug" };
export type CategoryName = string & { readonly __brand: "CategoryName" };

const SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const graphemes = new Intl.Segmenter();

const isSlug = (value: string): value is CategorySlug =>
  value.length <= MAX_CATEGORY_SLUG_LENGTH && SLUG_FORMAT.test(value);

const isName = (value: string): value is CategoryName => {
  const length = Array.from(graphemes.segment(value)).length;
  return length > 0 && length <= MAX_CATEGORY_NAME_LENGTH;
};

export const parseCategorySlug = (raw: string): Result<CategorySlug, "invalid_slug"> =>
  isSlug(raw) ? ok(raw) : err("invalid_slug");

export const parseCategoryName = (raw: string): Result<CategoryName, "invalid_name"> => {
  const trimmed = raw.trim();
  return isName(trimmed) ? ok(trimmed) : err("invalid_name");
};

export const MAX_CATEGORY_TAGS = 5;
export const MAX_CATEGORY_TAG_LENGTH = 24;

const TAG_FORMAT = /^[\p{L}\p{M}\p{N} &'-]+$/u;

const isTag = (value: string): boolean =>
  Array.from(graphemes.segment(value)).length <= MAX_CATEGORY_TAG_LENGTH && TAG_FORMAT.test(value);

const hasDuplicate = (tags: readonly string[]): boolean => {
  const sameTag = new Intl.Collator("fr", { sensitivity: "base" });
  return tags.some((tag, index) =>
    tags.slice(0, index).some((other) => sameTag.compare(tag, other) === 0),
  );
};

export const parseCategoryTags = (
  raw: readonly string[],
): Result<readonly string[], "invalid_tags"> => {
  const tags = raw.map((tag) => tag.trim());
  return tags.length <= MAX_CATEGORY_TAGS && !hasDuplicate(tags) && tags.every(isTag)
    ? ok(tags)
    : err("invalid_tags");
};
