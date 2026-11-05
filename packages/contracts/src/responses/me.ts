import { z } from "zod";

import { Uuid } from "../conventions/schemas.ts";

export const Me = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    bio: z.string().optional(),
    lastLiveAt: z.iso.datetime().optional(),
    avatarUrl: z.url({ protocol: /^https?$/ }).optional(),
  })
  .meta({ id: "Me" });
