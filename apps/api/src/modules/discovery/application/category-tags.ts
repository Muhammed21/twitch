export type CategoryTagCount = {
  readonly name: string;
  readonly categoryCount: number;
};

export interface ActiveCategoryTags {
  tagsOfActiveCategories(): Promise<readonly (readonly string[])[]>;
}

export type ListCategoryTags = () => Promise<readonly CategoryTagCount[]>;

type Spellings = readonly [string, ...string[]];

const occurrencesOf = (spellings: Spellings, spelling: string): number =>
  spellings.filter((candidate) => candidate === spelling).length;

const displayedSpelling = (spellings: Spellings): string =>
  spellings.reduce((best, spelling) => {
    const lead = occurrencesOf(spellings, spelling) - occurrencesOf(spellings, best);
    return lead > 0 || (lead === 0 && spelling < best) ? spelling : best;
  });

export const listCategoryTags =
  (source: ActiveCategoryTags): ListCategoryTags =>
  async () => {
    const collator = new Intl.Collator("fr", { sensitivity: "base" });
    const tags = (await source.tagsOfActiveCategories()).flat();
    const groups = tags.reduce<readonly Spellings[]>((found, tag) => {
      const index = found.findIndex(([first]) => collator.compare(first, tag) === 0);
      return index === -1
        ? [...found, [tag]]
        : found.map((spellings, position) =>
            position === index ? [...spellings, tag] : spellings,
          );
    }, []);
    return groups
      .map((spellings) => ({ name: displayedSpelling(spellings), categoryCount: spellings.length }))
      .toSorted(
        (left, right) =>
          right.categoryCount - left.categoryCount || collator.compare(left.name, right.name),
      );
  };
