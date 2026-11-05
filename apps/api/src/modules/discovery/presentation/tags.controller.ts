import { Controller, Get, Inject } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { ListCategoryTags } from "../application/category-tags.ts";

export const LIST_CATEGORY_TAGS = Symbol("LIST_CATEGORY_TAGS");

class CategoryTagList extends responseDto(responses.CategoryTagList) {}

@Controller("tags")
export class TagsController {
  constructor(@Inject(LIST_CATEGORY_TAGS) private readonly listCategoryTags: ListCategoryTags) {}

  @Get()
  @ZodResponse({ status: 200, type: CategoryTagList })
  async list(): Promise<z.input<typeof responses.CategoryTagList>> {
    return { items: [...(await this.listCategoryTags())] };
  }
}
