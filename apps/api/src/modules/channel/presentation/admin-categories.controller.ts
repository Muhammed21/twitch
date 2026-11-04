import { Body, Controller, HttpCode, Inject, Param, Post, Put, UseGuards } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import {
  AccessTokenGuard,
  CurrentIdentity,
  requiredScopeGuard,
} from "../../../platform/authentication.ts";
import type { ImageRejection } from "../../../platform/images/finalize-image.ts";
import { imageRejected } from "../../../platform/images/image-problems.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type {
  CategoryCreationError,
  CategoryMergeError,
  CategoryRetirementError,
  CategoryImageError,
  CategoryTagsError,
  CategoryView,
} from "../application/category-admin.ts";

export const CATEGORY_ADMIN = Symbol("CATEGORY_ADMIN");
export const CATEGORY_IMAGE_URL = Symbol("CATEGORY_IMAGE_URL");

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
  readonly image: (request: {
    actorId: string;
    slug: string;
    uploadId: string;
  }) => Promise<Result<CategoryView, CategoryImageError>>;
  readonly tags: (request: {
    actorId: string;
    slug: string;
    tags: readonly string[];
  }) => Promise<Result<CategoryView, CategoryTagsError>>;
};

class Category extends responseDto(responses.Category) {}

class CreateCategoryRequest extends createZodDto(
  z.strictObject({ slug: z.string(), name: z.string() }),
) {}

class MergeCategoryRequest extends createZodDto(z.strictObject({ targetSlug: z.string() })) {}

class CategoryImageRequest extends createZodDto(z.strictObject({ uploadId: Uuid })) {}

class CategoryTagsRequest extends createZodDto(z.strictObject({ tags: z.array(z.string()) })) {}

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
      detail:
        "Un slug s'écrit en minuscules, chiffres et tirets, sur 50 caractères au plus, et ne peut pas être catalog.",
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

const rejected = (rejection: ImageRejection) => () =>
  imageRejected({ rejection, purpose: "category" });

const IMAGE_PROBLEMS: Readonly<Record<CategoryImageError, () => ProblemException>> = {
  forbidden: PROBLEMS.forbidden,
  category_not_found: PROBLEMS.category_not_found,
  category_inactive: PROBLEMS.category_inactive,
  upload_not_found: rejected("upload_not_found"),
  too_large: rejected("too_large"),
  unsupported_type: rejected("unsupported_type"),
  too_small: rejected("too_small"),
  too_many_pixels: rejected("too_many_pixels"),
};

const TAGS_PROBLEMS: Readonly<Record<CategoryTagsError, () => ProblemException>> = {
  forbidden: PROBLEMS.forbidden,
  category_not_found: PROBLEMS.category_not_found,
  category_inactive: PROBLEMS.category_inactive,
  invalid_tags: () =>
    new ProblemException({
      status: 400,
      title: "Tags de catégorie invalides",
      detail:
        "Une catégorie porte 5 tags au plus, distincts, de 1 à 24 lettres, chiffres, espaces, tirets, apostrophes ou &.",
    }),
};

type CategoryResponse = z.input<typeof responses.Category>;

const unwrap = <Error extends string>(
  outcome: Result<CategoryView, Error>,
  problems: Readonly<Record<Error, () => ProblemException>>,
): CategoryView => {
  if (!outcome.ok) {
    throw problems[outcome.error]();
  }
  return outcome.value;
};

@Controller("admin/categories")
@UseGuards(AccessTokenGuard, requiredScopeGuard(CATEGORY_MANAGE_SCOPE))
export class AdminCategoriesController {
  constructor(
    @Inject(CATEGORY_ADMIN) private readonly admin: CategoryAdmin,
    @Inject(CATEGORY_IMAGE_URL) private readonly imageUrlOf: (key: string) => string,
  ) {}

  private present({ id, slug, name, status, imageKey, tags }: CategoryView): CategoryResponse {
    return {
      id,
      slug,
      name,
      status,
      tags: [...tags],
      ...(imageKey === null ? {} : { imageUrl: this.imageUrlOf(imageKey) }),
    };
  }

  @Post()
  @ZodResponse({ status: 201, type: Category })
  async create(
    @Body() body: CreateCategoryRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryResponse> {
    return this.present(
      unwrap(
        await this.admin.create({ actorId: identity.userId, slug: body.slug, name: body.name }),
        PROBLEMS,
      ),
    );
  }

  @Post(":slug/merge")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: Category })
  async merge(
    @Param("slug") slug: string,
    @Body() body: MergeCategoryRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryResponse> {
    return this.present(
      unwrap(
        await this.admin.merge({
          actorId: identity.userId,
          sourceSlug: slug,
          targetSlug: body.targetSlug,
        }),
        PROBLEMS,
      ),
    );
  }

  @Post(":slug/retire")
  @HttpCode(200)
  @ZodResponse({ status: 200, type: Category })
  async retire(
    @Param("slug") slug: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryResponse> {
    return this.present(
      unwrap(await this.admin.retire({ actorId: identity.userId, slug }), PROBLEMS),
    );
  }

  @Put(":slug/image")
  @ZodResponse({ status: 200, type: Category })
  async image(
    @Param("slug") slug: string,
    @Body() body: CategoryImageRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryResponse> {
    return this.present(
      unwrap(
        await this.admin.image({ actorId: identity.userId, slug, uploadId: body.uploadId }),
        IMAGE_PROBLEMS,
      ),
    );
  }

  @Put(":slug/tags")
  @ZodResponse({ status: 200, type: Category })
  async tags(
    @Param("slug") slug: string,
    @Body() body: CategoryTagsRequest,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<CategoryResponse> {
    return this.present(
      unwrap(
        await this.admin.tags({ actorId: identity.userId, slug, tags: body.tags }),
        TAGS_PROBLEMS,
      ),
    );
  }
}
