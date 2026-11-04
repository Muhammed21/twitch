import { Controller, Get, Inject, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import type { z } from "zod";

import type { responses } from "@repo/contracts";

import type { ListLives } from "../application/list-lives.ts";
import { CATEGORY_IMAGE_URL, type CategoryImageUrl } from "./category-image-url.ts";
import { LivePage, LivesQuerySchema, toLivePage } from "./live-page-response.ts";

export const LIST_LIVES = Symbol("LIST_LIVES");

class LivesQuery extends createZodDto(LivesQuerySchema) {}

@Controller("lives")
export class LivesController {
  constructor(
    @Inject(LIST_LIVES) private readonly listLives: ListLives,
    @Inject(CATEGORY_IMAGE_URL) private readonly imageUrlOf: CategoryImageUrl,
  ) {}

  @Get()
  @ZodResponse({ status: 200, type: LivePage })
  async list(@Query() query: LivesQuery): Promise<z.input<typeof responses.LivePage>> {
    return toLivePage(
      await this.listLives({ after: query.cursor, limit: query.limit }),
      this.imageUrlOf,
    );
  }
}
