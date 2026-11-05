import type { Result } from "@repo/result";

import {
  type CategoryFollowHead,
  type CategoryFollowPair,
  startFollowing,
  stopFollowing,
} from "../domain/category-follow.ts";

export interface CategoryFollows {
  change(input: {
    userId: string;
    slug: string;
    transition: (head: CategoryFollowHead | null) => CategoryFollowPair | null;
    outboxEventId: string;
    occurredAt: Date;
  }): Promise<Result<void, "category_not_found">>;
}

type Dependencies = {
  follows: CategoryFollows;
  newId: () => string;
  now: () => Date;
};

export type CategoryFollowRequest = { userId: string; slug: string };

export type ChangeCategoryFollow = (
  request: CategoryFollowRequest,
) => Promise<Result<void, "category_not_found">>;

export const followCategory =
  ({ follows, newId, now }: Dependencies): ChangeCategoryFollow =>
  ({ userId, slug }) => {
    const occurredAt = now();
    return follows.change({
      userId,
      slug,
      transition: (head) => startFollowing(head, occurredAt),
      outboxEventId: newId(),
      occurredAt,
    });
  };

export const unfollowCategory =
  ({ follows, newId, now }: Dependencies): ChangeCategoryFollow =>
  ({ userId, slug }) =>
    follows.change({
      userId,
      slug,
      transition: (head) => stopFollowing(head, "unfollowed"),
      outboxEventId: newId(),
      occurredAt: now(),
    });
