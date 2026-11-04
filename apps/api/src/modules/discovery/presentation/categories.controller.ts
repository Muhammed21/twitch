import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import type { responses } from "@repo/contracts";

import { ProblemException } from "../../../platform/problem.ts";
import type { ListCategoryLives } from "../application/category-reads.ts";
import { LivePage, LivesQuerySchema, toLivePage } from "./live-page-response.ts";

export const LIST_CATEGORY_LIVES = Symbol("LIST_CATEGORY_LIVES");

class LivesQuery extends createZodDto(LivesQuerySchema) {}

@Controller("categories")
export class CategoriesController {
  constructor(@Inject(LIST_CATEGORY_LIVES) private readonly listCategoryLives: ListCategoryLives) {}

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
