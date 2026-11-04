import type { AuthzContext } from "@repo/authorization";
import { err, type Result } from "@repo/result";

import type { FinalizeImage, ImageRejection } from "../../../platform/images/finalize-image.ts";
import {
  type CategoryName,
  type CategorySlug,
  parseCategoryName,
  parseCategorySlug,
} from "../domain/category.ts";

export type CategoryStatus = "active" | "merged" | "retired";

export type CategoryView = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: CategoryStatus;
  readonly imageKey: string | null;
};

export type CategoryCreation = {
  readonly categoryId: string;
  readonly slug: CategorySlug;
  readonly name: CategoryName;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export type CategoryMerge = {
  readonly sourceId: string;
  readonly targetId: string;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export type CategoryRetirement = {
  readonly categoryId: string;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export type CategoryImageChange = {
  readonly categoryId: string;
  readonly imageKey: string;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export interface CategoryCatalog {
  findBySlug(slug: string): Promise<CategoryView | null>;
  create(creation: CategoryCreation): Promise<Result<CategoryView, "slug_taken">>;
  merge(merge: CategoryMerge): Promise<Result<CategoryView, "invalid_merge">>;
  retire(
    retirement: CategoryRetirement,
  ): Promise<Result<CategoryView, "category_inactive" | "category_in_use">>;
  changeImage(change: CategoryImageChange): Promise<Result<CategoryView, "category_inactive">>;
}

type Dependencies = {
  catalog: CategoryCatalog;
  authz: AuthzContext;
  newId: () => string;
  now: () => Date;
};

const isAdmin = async (authz: AuthzContext, actorId: string): Promise<boolean> =>
  (await authz.abilityFor(actorId)).can("administer", "Category");

export type CategoryCreationError = "forbidden" | "invalid_slug" | "invalid_name" | "slug_taken";

export const createCategory =
  ({ catalog, authz, newId, now }: Dependencies) =>
  async ({
    actorId,
    slug,
    name,
  }: {
    actorId: string;
    slug: string;
    name: string;
  }): Promise<Result<CategoryView, CategoryCreationError>> => {
    if (!(await isAdmin(authz, actorId))) {
      return err("forbidden");
    }
    const parsedSlug = parseCategorySlug(slug);
    if (!parsedSlug.ok) {
      return parsedSlug;
    }
    const parsedName = parseCategoryName(name);
    if (!parsedName.ok) {
      return parsedName;
    }
    return catalog.create({
      categoryId: newId(),
      slug: parsedSlug.value,
      name: parsedName.value,
      outboxEventId: newId(),
      occurredAt: now(),
    });
  };

export type CategoryMergeError = "forbidden" | "category_not_found" | "invalid_merge";

export const mergeCategory =
  ({ catalog, authz, newId, now }: Dependencies) =>
  async ({
    actorId,
    sourceSlug,
    targetSlug,
  }: {
    actorId: string;
    sourceSlug: string;
    targetSlug: string;
  }): Promise<Result<CategoryView, CategoryMergeError>> => {
    if (!(await isAdmin(authz, actorId))) {
      return err("forbidden");
    }
    const source = await catalog.findBySlug(sourceSlug);
    const target = await catalog.findBySlug(targetSlug);
    if (source === null || target === null) {
      return err("category_not_found");
    }
    if (source.id === target.id) {
      return err("invalid_merge");
    }
    return catalog.merge({
      sourceId: source.id,
      targetId: target.id,
      outboxEventId: newId(),
      occurredAt: now(),
    });
  };

export type CategoryRetirementError =
  | "forbidden"
  | "category_not_found"
  | "category_inactive"
  | "category_in_use";

export const retireCategory =
  ({ catalog, authz, newId, now }: Dependencies) =>
  async ({
    actorId,
    slug,
  }: {
    actorId: string;
    slug: string;
  }): Promise<Result<CategoryView, CategoryRetirementError>> => {
    if (!(await isAdmin(authz, actorId))) {
      return err("forbidden");
    }
    const category = await catalog.findBySlug(slug);
    if (category === null) {
      return err("category_not_found");
    }
    return catalog.retire({ categoryId: category.id, outboxEventId: newId(), occurredAt: now() });
  };

export type CategoryImageError =
  | "forbidden"
  | "category_not_found"
  | "category_inactive"
  | ImageRejection;

export const changeCategoryImage =
  ({
    catalog,
    authz,
    finalizeImage,
    newId,
    now,
  }: Dependencies & { finalizeImage: FinalizeImage }) =>
  async ({
    actorId,
    slug,
    uploadId,
  }: {
    actorId: string;
    slug: string;
    uploadId: string;
  }): Promise<Result<CategoryView, CategoryImageError>> => {
    if (!(await isAdmin(authz, actorId))) {
      return err("forbidden");
    }
    const category = await catalog.findBySlug(slug);
    if (category === null) {
      return err("category_not_found");
    }
    if (category.status !== "active") {
      return err("category_inactive");
    }
    const image = await finalizeImage({ uploadId, purpose: "category", userId: actorId });
    if (!image.ok) {
      return image;
    }
    return catalog.changeImage({
      categoryId: category.id,
      imageKey: image.value.key,
      outboxEventId: newId(),
      occurredAt: now(),
    });
  };
