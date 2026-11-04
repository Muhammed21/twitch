export type CategoryFollowEndedReason = "unfollowed" | "category_merged" | "category_retired";

export type CategoryFollowPair =
  | {
      readonly state: "following";
      readonly followedAt: Date;
      readonly version: number;
      readonly endedReason: null;
    }
  | {
      readonly state: "not_following";
      readonly followedAt: null;
      readonly version: number;
      readonly endedReason: CategoryFollowEndedReason;
    };

export type CategoryFollowHead = Pick<CategoryFollowPair, "state" | "version">;

export const startFollowing = (
  head: CategoryFollowHead | null,
  at: Date,
): CategoryFollowPair | null =>
  head?.state === "following"
    ? null
    : { state: "following", followedAt: at, version: (head?.version ?? 0) + 1, endedReason: null };

export const stopFollowing = (
  head: CategoryFollowHead | null,
  reason: CategoryFollowEndedReason,
): CategoryFollowPair | null =>
  head?.state === "following"
    ? { state: "not_following", followedAt: null, version: head.version + 1, endedReason: reason }
    : null;
