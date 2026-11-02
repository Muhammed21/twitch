import { Controller, Get, Inject, Query } from "@nestjs/common";
import { createZodDto, ZodResponse } from "nestjs-zod";
import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { LivePosition, LivesPage } from "../application/list-lives.ts";
import { encodeLiveCursor, LiveCursor } from "./live-cursor.ts";

export const LIST_LIVES = Symbol("LIST_LIVES");

export type ListLives = (request: {
  after: LivePosition | undefined;
  limit: number;
}) => Promise<LivesPage>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

class LivesQuery extends createZodDto(
  z.object({
    cursor: LiveCursor.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  }),
) {}

class LivePage extends responseDto(responses.LivePage) {}

@Controller("lives")
export class LivesController {
  constructor(@Inject(LIST_LIVES) private readonly listLives: ListLives) {}

  @Get()
  @ZodResponse({ status: 200, type: LivePage })
  async list(@Query() query: LivesQuery): Promise<z.input<typeof responses.LivePage>> {
    const { items, next } = await this.listLives({ after: query.cursor, limit: query.limit });
    return {
      items: items.map(({ channelId, slug, title, startedAt }) => ({
        channelId,
        slug,
        title,
        startedAt: startedAt.toISOString(),
      })),
      ...(next === undefined ? {} : { nextCursor: encodeLiveCursor(next) }),
    };
  }
}
