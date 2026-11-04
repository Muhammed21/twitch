import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { AudiencePosition } from "../application/category-audience.ts";
import { cursorOf, encodeCursor } from "./live-cursor.ts";

const MAX_INTEGER = 2_147_483_647;

const Count = z.int().min(0).max(MAX_INTEGER);

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
