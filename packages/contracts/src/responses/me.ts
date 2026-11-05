import { z } from "zod";

import { ChatColor, Uuid } from "../conventions/schemas.ts";

export const Me = z
  .looseObject({
    id: Uuid,
    name: z.string(),
    email: z.string(),
    bio: z.string().optional(),
    lastLiveAt: z.iso.datetime().optional(),
    avatarUrl: z.url({ protocol: /^https?$/ }).optional(),
    bannerUrl: z.url({ protocol: /^https?$/ }).optional(),
    chatColor: ChatColor.optional(),
  })
  .meta({ id: "Me" });
