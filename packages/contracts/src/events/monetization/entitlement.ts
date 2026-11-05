import { z } from "zod";

import { openEnum, Uuid } from "../../conventions/schemas.ts";

const Scope = openEnum(["platform"]).pipe(z.string().min(1));

export const entitlementGranted = {
  name: "monetization.entitlement.granted",
  version: 1,
  payload: z.looseObject({ userId: Uuid, scope: Scope, expiresAt: z.iso.datetime() }),
} as const;

export const entitlementRevoked = {
  name: "monetization.entitlement.revoked",
  version: 1,
  payload: z.looseObject({ userId: Uuid, scope: Scope }),
} as const;
