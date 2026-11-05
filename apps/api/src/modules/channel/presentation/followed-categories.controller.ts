import { Controller, Delete, HttpCode, Inject, Param, Put, UseGuards } from "@nestjs/common";

import type { AccessTokenIdentity } from "@repo/auth-verifier";

import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { ChangeCategoryFollow } from "../application/category-follow.ts";

export const FOLLOW_CATEGORY = Symbol("FOLLOW_CATEGORY");
export const UNFOLLOW_CATEGORY = Symbol("UNFOLLOW_CATEGORY");

const changeFollow = async (
  change: ChangeCategoryFollow,
  request: { userId: string; slug: string },
): Promise<void> => {
  const changed = await change(request);
  if (!changed.ok) {
    throw new ProblemException({ status: 404, title: "Catégorie introuvable" });
  }
};

@Controller("me/followed-categories")
@UseGuards(AccessTokenGuard)
export class FollowedCategoriesController {
  constructor(
    @Inject(FOLLOW_CATEGORY) private readonly followCategory: ChangeCategoryFollow,
    @Inject(UNFOLLOW_CATEGORY) private readonly unfollowCategory: ChangeCategoryFollow,
  ) {}

  @Put(":slug")
  @HttpCode(204)
  follow(
    @Param("slug") slug: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<void> {
    return changeFollow(this.followCategory, { userId: identity.userId, slug });
  }

  @Delete(":slug")
  @HttpCode(204)
  unfollow(
    @Param("slug") slug: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<void> {
    return changeFollow(this.unfollowCategory, { userId: identity.userId, slug });
  }
}
