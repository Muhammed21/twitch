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
