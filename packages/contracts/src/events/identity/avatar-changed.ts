import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const avatarChanged = {
  name: "identity.avatar.changed",
  version: 1,
  payload: z.looseObject({ accountId: Uuid, avatarKey: z.string().min(1) }),
} as const;
