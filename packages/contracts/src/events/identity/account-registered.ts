import { z } from "zod";

import { Uuid } from "../../conventions/schemas.ts";

export const accountRegistered = {
  name: "identity.account.registered",
  version: 1,
  payload: z.looseObject({ accountId: Uuid }),
} as const;
