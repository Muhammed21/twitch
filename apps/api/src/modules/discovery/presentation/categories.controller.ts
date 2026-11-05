import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { BrowseCategories } from "../application/category-audience.ts";
import type { ListCategoryLives, ReadCategoryHeader } from "../application/category-reads.ts";
import { AudienceCursor, encodeAudienceCursor } from "./category-cursor.ts";
import { CATEGORY_IMAGE_URL, type CategoryImageUrl, withImageUrl } from "./category-image-url.ts";
import { LivePage, LivesQuerySchema, toLivePage } from "./live-page-response.ts";

export const LIST_CATEGORY_LIVES = Symbol("LIST_CATEGORY_LIVES");
export const BROWSE_CATEGORIES = Symbol("BROWSE_CATEGORIES");
export const READ_CATEGORY_HEADER = Symbol("READ_CATEGORY_HEADER");

class LivesQuery extends createZodDto(LivesQuerySchema) {}

class BrowseQuery extends createZodDto(
  LivesQuerySchema.extend({ cursor: AudienceCursor.optional() }),
) {}

class BrowseCategoryList extends responseDto(responses.BrowseCategoryList) {}

class CategoryHeader extends responseDto(responses.CategoryHeader) {}

const categoryNotFound = () =>
  new ProblemException({ status: 404, title: "Catégorie introuvable" });

@Controller("categories")
export class CategoriesController {
  constructor(
    @Inject(LIST_CATEGORY_LIVES) private readonly listCategoryLives: ListCategoryLives,
    @Inject(BROWSE_CATEGORIES) private readonly browseCategories: BrowseCategories,
    @Inject(READ_CATEGORY_HEADER) private readonly readCategoryHeader: ReadCategoryHeader,
    @Inject(CATEGORY_IMAGE_URL) private readonly imageUrlOf: CategoryImageUrl,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: BrowseCategoryList })
  async browse(@Query() query: BrowseQuery): Promise<z.input<typeof responses.BrowseCategoryList>> {
    const { items, next } = await this.browseCategories({
      after: query.cursor,
      limit: query.limit,
    });
    return {
      items: items.map(({ slug, name, imageKey, liveCount, viewerCount, tags }) =>
        withImageUrl(
          { slug, name, imageKey, liveCount, viewerCount, tags: [...tags] },
          this.imageUrlOf,
        ),
      ),
      ...(next === undefined ? {} : { nextCursor: encodeAudienceCursor(next) }),
    };
  }

  @Get(":slug/lives")
  @ZodResponse({ status: 200, type: LivePage })
  async lives(
    @Param("slug") slug: string,
    @Query() query: LivesQuery,
  ): Promise<z.input<typeof responses.LivePage>> {
    const page = await this.listCategoryLives({ slug, after: query.cursor, limit: query.limit });
    if (!page.ok) {
      throw categoryNotFound();
    }
    return toLivePage(page.value, this.imageUrlOf);
  }

  @Get(":slug")
  @ZodResponse({ status: 200, type: CategoryHeader })
  async header(@Param("slug") slug: string): Promise<z.input<typeof responses.CategoryHeader>> {
    const header = await this.readCategoryHeader(slug);
    if (!header.ok) {
      throw categoryNotFound();
    }
    const { name, imageKey, liveCount, viewerCount, tags } = header.value;
    return withImageUrl(
      { slug: header.value.slug, name, imageKey, liveCount, viewerCount, tags: [...tags] },
      this.imageUrlOf,
    );
  }
}
