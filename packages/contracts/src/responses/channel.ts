import { z } from "zod";

import { openEnum, Uuid } from "../conventions/schemas.ts";
import { CategorySummary } from "./category.ts";

const CHANNEL_LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ja",
  "ko",
  "zh",
  "ru",
  "pl",
  "tr",
] as const;

const CONTENT_LABELS = [
  "sexual_themes",
  "drugs_intoxication_tobacco",
  "gambling",
  "violent_graphic",
  "profanity",
  "mature_rated_games",
  "politics_sensitive",
] as const;

export const Channel = z
  .looseObject({
    id: Uuid,
    slug: z.string(),
    title: z.string(),
    ownerId: Uuid,
    category: CategorySummary.optional(),
    bannerUrl: z.url({ protocol: /^https?$/ }).optional(),
    tags: z.array(z.string()),
    language: openEnum(CHANNEL_LANGUAGES).optional(),
    contentLabels: z.array(openEnum(CONTENT_LABELS)),
    isBrandedContent: z.boolean(),
  })
  .meta({ id: "Channel" });
