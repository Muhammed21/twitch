import { Controller, Get, Inject, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { ChannelCategoryView } from "../application/channel-queries.ts";

export const SEARCH_CATEGORIES = Symbol("SEARCH_CATEGORIES");

export type SearchCategories = (
  query: string | undefined,
) => Promise<readonly ChannelCategoryView[]>;

class CatalogQuery extends createZodDto(z.object({ q: z.string().optional() })) {}

class CategoryCatalog extends responseDto(responses.CategoryCatalog) {}

@Controller("categories")
export class CategoryCatalogController {
  constructor(@Inject(SEARCH_CATEGORIES) private readonly search: SearchCategories) {}

  @Get("catalog")
  @ZodResponse({ status: 200, type: CategoryCatalog })
  async read(@Query() query: CatalogQuery): Promise<z.input<typeof responses.CategoryCatalog>> {
    return { categories: [...(await this.search(query.q))] };
  }
}
