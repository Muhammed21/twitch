import type { AuthzContext } from "@repo/authorization";
import { err, type Result } from "@repo/result";

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
};

export type CategoryCreation = {
  readonly categoryId: string;
  readonly slug: CategorySlug;
  readonly name: CategoryName;
  readonly outboxEventId: string;
  readonly occurredAt: Date;
};

export interface CategoryCatalog {
  create(creation: CategoryCreation): Promise<Result<CategoryView, "slug_taken">>;
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
