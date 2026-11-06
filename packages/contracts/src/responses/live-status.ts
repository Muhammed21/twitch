import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const LiveStatus = z
  .looseObject({
    channelId: Uuid,
    live: z.boolean(),
    startedAt: z.iso.datetime().optional(),
    viewerCount: z.int().min(0).optional(),
    thumbnailUrl: z.url({ protocol: /^https?$/ }).optional(),
  })
  .meta({ id: "LiveStatus" });
