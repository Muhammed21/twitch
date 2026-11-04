import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Live = z
  .looseObject({
    channelId: Uuid,
    slug: z.string(),
    title: z.string(),
    startedAt: z.iso.datetime(),
    viewerCount: z.int().min(0).optional(),
    thumbnailUrl: z.url({ protocol: /^https?$/ }).optional(),
  })
  .meta({ id: "Live" });

export const LivePage = z
  .looseObject({
    items: z.array(Live),
    nextCursor: z.string().optional(),
  })
  .meta({ id: "LivePage" });
