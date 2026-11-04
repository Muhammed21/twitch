import { Controller, Get, Inject, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { CatalogCategory } from "../application/category-search.ts";
import { CATEGORY_IMAGE_URL } from "./admin-categories.controller.ts";

export const SEARCH_CATEGORIES = Symbol("SEARCH_CATEGORIES");

export type SearchCategories = (query: string | undefined) => Promise<readonly CatalogCategory[]>;

class CatalogQuery extends createZodDto(z.object({ q: z.string().optional() })) {}

class CategoryCatalog extends responseDto(responses.CategoryCatalog) {}

@Controller("categories")
export class CategoryCatalogController {
  constructor(
    @Inject(SEARCH_CATEGORIES) private readonly search: SearchCategories,
    @Inject(CATEGORY_IMAGE_URL) private readonly imageUrlOf: (key: string) => string,
  ) {}

  @Get("catalog")
  @ZodResponse({ status: 200, type: CategoryCatalog })
  async read(@Query() query: CatalogQuery): Promise<z.input<typeof responses.CategoryCatalog>> {
    const found = await this.search(query.q);
    return {
      categories: found.map(({ id, slug, name, imageKey }) => ({
        id,
        slug,
        name,
        ...(imageKey === null ? {} : { imageUrl: this.imageUrlOf(imageKey) }),
      })),
    };
  }
}
