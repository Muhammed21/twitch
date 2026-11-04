import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AudiencePosition } from "../application/category-audience.ts";
import { cursorOf, encodeCursor } from "./live-cursor.ts";

const Count = z.int().min(0);

export const encodeAudienceCursor = ({
  viewerCount,
  liveCount,
  categoryId,
}: AudiencePosition): string => encodeCursor([viewerCount, liveCount, categoryId]);

export const AudienceCursor = cursorOf(
  z.tuple([Count, Count, Uuid]),
  ([viewerCount, liveCount, categoryId]): AudiencePosition => ({
    viewerCount,
    liveCount,
    categoryId,
  }),
);
