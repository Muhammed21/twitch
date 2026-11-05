import { z } from "zod";

import { responses } from "@repo/contracts";

import { responseDto } from "../../../openapi/response-dto.ts";
import type { LivesPage } from "../application/list-lives.ts";
import { type CategoryImageUrl, withImageUrl } from "./category-image-url.ts";
import { encodeLiveCursor, LiveCursor } from "./live-cursor.ts";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const LivesQuerySchema = z.object({
  cursor: LiveCursor.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export class LivePage extends responseDto(responses.LivePage) {}

export const toLivePage = (
  { items, next }: LivesPage,
  imageUrlOf: CategoryImageUrl,
): z.input<typeof responses.LivePage> => ({
  items: items.map(
    ({ channelId, slug, title, startedAt, viewerCount, thumbnailUrl, avatarKey, category }) => ({
      channelId,
      slug,
      title,
      startedAt: startedAt.toISOString(),
      viewerCount,
      thumbnailUrl,
      avatarUrl: avatarKey === null ? undefined : imageUrlOf(avatarKey),
      category: category === undefined ? undefined : withImageUrl(category, imageUrlOf),
    }),
  ),
  ...(next === undefined ? {} : { nextCursor: encodeLiveCursor(next) }),
});
