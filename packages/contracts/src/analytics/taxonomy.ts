import { z } from "zod";

import type { EventDefinition } from "./check-taxonomy.ts";

const onClient = <const Shape extends z.ZodRawShape>(shape: Shape) =>
  ({ source: "client", properties: z.strictObject(shape) }) as const satisfies EventDefinition;

const step = z.string().min(1);
const paywallVariant = z.string().min(1);

export const AnalyticsEvents = {
  "account:signed_up": onClient({}),
  "account:signed_in": onClient({}),
  "account:signed_out": onClient({}),
  "onboarding:started": onClient({}),
  "onboarding:step_completed": onClient({ step, duration_ms: z.int().nonnegative() }),
  "onboarding:step_skipped": onClient({ step }),
  "onboarding:completed": onClient({}),
  "onboarding:abandoned": onClient({ step }),
  "category:followed": onClient({
    category_id: z.string().min(1),
    source: z.enum(["onboarding", "category"]),
  }),
  "paywall:viewed": onClient({ paywall_variant: paywallVariant }),
  "paywall:dismissed": onClient({ paywall_variant: paywallVariant }),
  "paywall:purchase_started": onClient({ paywall_variant: paywallVariant }),
} as const;

export type AnalyticsEventName = keyof typeof AnalyticsEvents;
