import { z } from "zod";

import { Uuid } from "@repo/contracts";

import type { LivePosition } from "../application/list-lives.ts";

const Position = z.tuple([z.iso.datetime(), Uuid]);

export const encodeLiveCursor = ({ startedAt, channelId }: LivePosition): string =>
  Buffer.from(JSON.stringify([startedAt.toISOString(), channelId])).toString("base64url");

const decoded = (cursor: string): unknown => {
  try {
    const json: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return json;
  } catch {
    return undefined;
  }
};

export const LiveCursor = z.string().transform((cursor, context): LivePosition => {
  const position = Position.safeParse(decoded(cursor));
  if (!position.success) {
    context.addIssue({ code: "custom", message: "Curseur illisible" });
    return z.NEVER;
  }
  const [startedAt, channelId] = position.data;
  return { startedAt: new Date(startedAt), channelId };
});
