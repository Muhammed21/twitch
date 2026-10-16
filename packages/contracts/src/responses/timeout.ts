import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Timeout = z
  .looseObject({
    channelId: Uuid,
    userId: Uuid,
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "Timeout" });
