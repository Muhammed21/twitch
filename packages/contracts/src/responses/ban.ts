import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Ban = z
  .looseObject({
    channelId: Uuid,
    userId: Uuid,
    expiresAt: z.iso.datetime().optional(),
    reason: z.string(),
  })
  .meta({ id: "Ban" });
