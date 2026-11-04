import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { LivePosition } from "../application/list-lives.ts";

const FIRST_YEAR = 1;

const Position = z.tuple([
  z.iso.datetime().refine((startedAt) => new Date(startedAt).getUTCFullYear() >= FIRST_YEAR),
  Uuid,
]);

export const encodeCursor = (position: readonly unknown[]): string =>
  Buffer.from(JSON.stringify(position)).toString("base64url");

const decoded = (cursor: string): unknown => {
  try {
    const json: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return json;
  } catch {
    return undefined;
  }
};

export const cursorOf = <Fields, Value>(
  fields: z.ZodType<Fields>,
  toValue: (fields: Fields) => Value,
) =>
  z.string().transform((cursor, context): Value => {
    const position = fields.safeParse(decoded(cursor));
    if (!position.success) {
      context.addIssue({ code: "custom", message: "Curseur illisible" });
      return z.NEVER;
    }
    return toValue(position.data);
  });

export const encodeLiveCursor = ({ startedAt, channelId }: LivePosition): string =>
  encodeCursor([startedAt.toISOString(), channelId]);

export const LiveCursor = cursorOf(Position, ([startedAt, channelId]): LivePosition => ({
  startedAt: new Date(startedAt),
  channelId,
}));
