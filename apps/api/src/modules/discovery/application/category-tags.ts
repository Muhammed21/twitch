export type CategoryTagCount = {
  readonly name: string;
  readonly categoryCount: number;
};

export interface ActiveCategoryTags {
  tagsOfActiveCategories(): Promise<readonly (readonly string[])[]>;
}

export type ListCategoryTags = () => Promise<readonly CategoryTagCount[]>;

const sameTagKey = (tag: string): string =>
  tag.normalize("NFD").replaceAll(/\p{M}/gu, "").toLocaleLowerCase("fr");

const byCodePoint = (left: string, right: string): number => (left < right ? -1 : 1);

const groupsOf = (
  values: readonly string[],
  keyOf: (value: string) => string,
): readonly (readonly string[])[] => {
  const keyed = values
    .map((value) => ({ value, key: keyOf(value) }))
    .toSorted((left, right) => (left.key === right.key ? 0 : byCodePoint(left.key, right.key)));
  const starts = keyed.flatMap(({ key }, index) => (keyed[index - 1]?.key === key ? [] : [index]));
  return starts.map((start, position) =>
    keyed.slice(start, starts[position + 1]).map(({ value }) => value),
  );
};

const displayedSpelling = (spellings: readonly string[]): string =>
  groupsOf(spellings, (spelling) => spelling).reduce((best, run) =>
    run.length > best.length ? run : best,
  )[0] ?? "";

export const listCategoryTags =
  (source: ActiveCategoryTags): ListCategoryTags =>
  async () => {
    const collator = new Intl.Collator("fr");
    const tags = (await source.tagsOfActiveCategories()).flat();
    return groupsOf(tags, sameTagKey)
      .map((spellings) => ({ name: displayedSpelling(spellings), categoryCount: spellings.length }))
      .toSorted(
        (left, right) =>
          right.categoryCount - left.categoryCount || collator.compare(left.name, right.name),
      );
  };
