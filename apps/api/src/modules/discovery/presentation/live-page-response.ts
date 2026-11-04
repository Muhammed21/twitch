import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { LivesPage } from "../application/list-lives.ts";
import { encodeLiveCursor, LiveCursor } from "./live-cursor.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const LivesQuerySchema = z.object({
  cursor: LiveCursor.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export class LivePage extends responseDto(responses.LivePage) {}

export const toLivePage = ({ items, next }: LivesPage): z.input<typeof responses.LivePage> => ({
  items: items.map(({ channelId, slug, title, startedAt, viewerCount, category }) => ({
    channelId,
    slug,
    title,
    startedAt: startedAt.toISOString(),
    viewerCount,
    category,
  })),
  ...(next === undefined ? {} : { nextCursor: encodeLiveCursor(next) }),
});
