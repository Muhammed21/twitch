export type CategoryFollowView = {
  readonly userId: string;
  readonly categoryId: string;
  readonly following: boolean;
  readonly version: number;
};

export type CategoryFollowEvent = {
  readonly kind: "category-follow-changed";
  readonly userId: string;
  readonly categoryId: string;
  readonly following: boolean;
  readonly version: number;
};

export type CategoryFollowerCount = {
  readonly categoryId: string;
  readonly followerCount: number;
};

export const applyCategoryFollowEvent = (
  current: CategoryFollowView | null,
  { userId, categoryId, following, version }: CategoryFollowEvent,
): CategoryFollowView | null =>
  current !== null && version <= current.version
    ? null
    : { userId, categoryId, following, version };

export const followerDelta = (
  before: CategoryFollowView | null,
  after: CategoryFollowView,
): number => Number(after.following) - Number(before?.following ?? false);

export const followerCounts = (
  follows: readonly CategoryFollowView[],
): readonly CategoryFollowerCount[] =>
  [
    ...follows
      .filter(({ following }) => following)
      .reduce(
        (counts, { categoryId }) => counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1),
        new Map<string, number>(),
      ),
  ].map(([categoryId, followerCount]) => ({ categoryId, followerCount }));
