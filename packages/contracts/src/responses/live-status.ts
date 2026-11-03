import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const LiveStatus = z
  .looseObject({
    channelId: Uuid,
    live: z.boolean(),
    startedAt: z.iso.datetime().optional(),
  })
  .meta({ id: "LiveStatus" });
