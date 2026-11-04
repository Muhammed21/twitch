import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  AccessTokenGuard,
  CurrentIdentity,
  requiredScopeGuard,
} from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type {
  CategoryCreationError,
  CategoryMergeError,
  CategoryRetirementError,
  CategoryView,
} from "../application/category-admin.ts";

export const CATEGORY_ADMIN = Symbol("CATEGORY_ADMIN");

export const CATEGORY_MANAGE_SCOPE = "admin:category.manage";

export type CategoryAdmin = {
  readonly create: (request: {
    actorId: string;
    slug: string;
    name: string;
  }) => Promise<Result<CategoryView, CategoryCreationError>>;
  readonly merge: (request: {
    actorId: string;
    sourceSlug: string;
    targetSlug: string;
  }) => Promise<Result<CategoryView, CategoryMergeError>>;
  readonly retire: (request: {
    actorId: string;
    slug: string;
  }) => Promise<Result<CategoryView, CategoryRetirementError>>;
};

class Category extends responseDto(responses.Category) {}

class CreateCategoryRequest extends createZodDto(
  z.strictObject({ slug: z.string(), name: z.string() }),
) {}

class MergeCategoryRequest extends createZodDto(z.strictObject({ targetSlug: z.string() })) {}

const PROBLEMS: Readonly<
  Record<
    CategoryCreationError | CategoryMergeError | CategoryRetirementError,
    () => ProblemException
  >
> = {
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  category_not_found: () => new ProblemException({ status: 404, title: "Catégorie introuvable" }),
  invalid_slug: () =>
    new ProblemException({
      status: 422,
      title: "Slug de catégorie invalide",
      detail: "Un slug s'écrit en minuscules, chiffres et tirets, sur 50 caractères au plus.",
    }),
  invalid_name: () =>
    new ProblemException({
      status: 422,
      title: "Nom de catégorie invalide",
      detail: "Un nom compte de 1 à 50 caractères.",
    }),
  slug_taken: () => new ProblemException({ status: 409, title: "Slug de catégorie déjà pris" }),
  invalid_merge: () =>
    new ProblemException({
      status: 409,
      title: "Fusion impossible",
      detail: "La source et la cible sont deux catégories distinctes et actives.",
    }),
  category_inactive: () =>
    new ProblemException({ status: 409, title: "Catégorie déjà fusionnée ou retirée" }),
  category_in_use: () =>
    new ProblemException({
      status: 409,
      title: "Catégorie encore utilisée",
      detail: "Une chaîne utilise cette catégorie : fusionne-la dans une autre.",
    }),
};

const unwrap = <Error extends keyof typeof PROBLEMS>(
  outcome: Result<CategoryView, Error>,
): CategoryView => {
  if (!outcome.ok) {
    throw PROBLEMS[outcome.error]();
  }
  return outcome.value;
};

@Controller("admin/categories")
@UseGuards(AccessTokenGuard, requiredScopeGuard(CATEGORY_MANAGE_SCOPE))
export class AdminCategoriesController {
  constructor(@Inject(CATEGORY_ADMIN) private readonly admin: CategoryAdmin) {}

  @Post()
  @ZodResponse({ status: 201, type: Category })
  async create(
    @Body() body: CreateCategoryRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryView> {
    return unwrap(
      await this.admin.create({ actorId: identity.userId, slug: body.slug, name: body.name }),
    );
  }

  @Post(":slug/merge")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: Category })
  async merge(
    @Param("slug") slug: string,
    @Body() body: MergeCategoryRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryView> {
    return unwrap(
      await this.admin.merge({
        actorId: identity.userId,
        sourceSlug: slug,
        targetSlug: body.targetSlug,
      }),
    );
  }

  @Post(":slug/retire")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: Category })
  async retire(
    @Param("slug") slug: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryView> {
    return unwrap(await this.admin.retire({ actorId: identity.userId, slug }));
  }
}
