import { describe, expect, it } from "vitest";

import { encodeCursor, encodeLiveCursor, LiveCursor } from "./live-cursor.ts";

const CHANNEL_ID = "6f1c2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

describe("curseur des lives", () => {
  it("relit la position qu'il encode", () => {
    const position = { startedAt: new Date("2026-11-04T20:00:00.000Z"), channelId: CHANNEL_ID };

    expect(LiveCursor.parse(encodeLiveCursor(position))).toEqual(position);
  });

  it("accepte une date du premier jour de l'an 1", () => {
    const cursor = encodeCursor(["0001-01-01T00:00:00.000Z", CHANNEL_ID]);

    expect(LiveCursor.safeParse(cursor).success).toBe(true);
  });

  it.each([
    ["qui n'est pas du base64url JSON", "pas-un-curseur"],
    ["dont la position est illisible", encodeCursor(["hier", "42"])],
    ["daté de l'an 0", encodeCursor(["0000-01-01T00:00:00.000Z", CHANNEL_ID])],
  ])("refuse un curseur %s en le nommant illisible", (_name, cursor) => {
    const result = LiveCursor.safeParse(cursor);

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "custom", message: "Curseur illisible" }),
    ]);
  });
});
