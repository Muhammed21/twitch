import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { BrowseCategories, ListCategoryLives } from "../application/category-reads.ts";
import { LivePage, LivesQuerySchema, toLivePage } from "./live-page-response.ts";

export const BROWSE_CATEGORIES = Symbol("BROWSE_CATEGORIES");
export const LIST_CATEGORY_LIVES = Symbol("LIST_CATEGORY_LIVES");

class LivesQuery extends createZodDto(LivesQuerySchema) {}

class BrowseCategoryList extends responseDto(responses.BrowseCategoryList) {}

@Controller("categories")
export class CategoriesController {
  constructor(
    @Inject(BROWSE_CATEGORIES) private readonly browseCategories: BrowseCategories,
    @Inject(LIST_CATEGORY_LIVES) private readonly listCategoryLives: ListCategoryLives,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: BrowseCategoryList })
  async browse(): Promise<z.input<typeof responses.BrowseCategoryList>> {
    return { items: [...(await this.browseCategories())] };
  }

  @Get(":slug/lives")
  @ZodResponse({ status: 200, type: LivePage })
  async lives(
    @Param("slug") slug: string,
    @Query() query: LivesQuery,
  ): Promise<z.input<typeof responses.LivePage>> {
    const page = await this.listCategoryLives({ slug, after: query.cursor, limit: query.limit });
    if (!page.ok) {
      throw new ProblemException({ status: 404, title: "Catégorie introuvable" });
    }
    return toLivePage(page.value);
  }
}
