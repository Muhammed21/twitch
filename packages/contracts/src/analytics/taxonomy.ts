import { z } from "zod";

import type { EventDefinition } from "./check-taxonomy.ts";

const onClient = <const Shape extends z.ZodRawShape>(shape: Shape) =>
  ({ source: "client", properties: z.strictObject(shape) }) as const satisfies EventDefinition;

const count = z.int().nonnegative();
const durationMs = z.int().nonnegative();
const identifier = z.string().min(1);
const variant = z.string().min(1);

const step = z.enum([
  "intro",
  "categories",
  "interests",
  "content_preferences",
  "live_language",
  "appearance",
  "video_autoplay",
  "notifications",
  "chat",
  "summary",
]);

const preference = z.enum([
  "appearance",
  "video_autoplay",
  "chat_text_size",
  "chat_timestamps",
  "live_language",
  "content_filters",
  "interests",
]);

const placement = z.enum(["onboarding", "profile"]);

export const AnalyticsEvents = {
  "account:signed_up": onClient({}),
  "account:signed_in": onClient({}),
  "account:signed_out": onClient({}),
  "onboarding:started": onClient({ step_count: count }),
  "onboarding:step_completed": onClient({
    step,
    step_index: count,
    duration_ms: durationMs,
    selection_count: count,
  }),
  "onboarding:step_skipped": onClient({ step, step_index: count }),
  "onboarding:completed": onClient({ duration_ms: durationMs, skipped_step_count: count }),
  "preference:changed": onClient({
    preference,
    value: z.string().min(1),
    source: z.enum(["onboarding", "settings"]),
  }),
  "notification_permission:answered": onClient({ is_granted: z.boolean() }),
  "paywall:viewed": onClient({ variant, offering_id: identifier, placement }),
  "paywall:dismissed": onClient({ variant, placement }),
  "purchase:started": onClient({ product_id: identifier, variant }),
  "purchase:completed": onClient({ product_id: identifier, variant }),
  "purchase:cancelled": onClient({ product_id: identifier, variant }),
  "purchase:failed": onClient({ product_id: identifier, variant, error_code: identifier }),
  "purchase:restored": onClient({ has_active_entitlement: z.boolean() }),
} as const;

export type AnalyticsEventName = keyof typeof AnalyticsEvents;
