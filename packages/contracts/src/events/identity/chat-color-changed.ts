import { z } from "zod";

import { ChatColor, Uuid } from "../../conventions/schemas.ts";

export const chatColorChanged = {
  name: "identity.chat_color.changed",
  version: 1,
  payload: z.looseObject({ accountId: Uuid, chatColor: ChatColor.nullable() }),
} as const;
