import { describe, expect, it } from "vitest";

import { StreamEnded, StreamStarted, VideoEvent } from "./index.ts";

const EVENT_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const OCCURRED_AT = "2026-10-15T20:00:00.000Z";

const makeEvent = (type: string, overrides: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  type,
  channelId: "vch_1",
  sessionId: "vss_1",
  occurredAt: OCCURRED_AT,
  ...overrides,
});

describe.each([
  ["stream.started", "stream.ended", StreamStarted],
  ["stream.ended", "stream.started", StreamEnded],
] as const)("%s", (type, otherType, schema) => {
  it("décode l'identifiant d'événement, le canal, la session et l'instant", () => {
    expect(schema.parse(makeEvent(type))).toEqual({
      id: EVENT_ID,
      type,
      channelId: "vch_1",
      sessionId: "vss_1",
      occurredAt: OCCURRED_AT,
    });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(schema.parse(makeEvent(type, { thumbnailUrl: "http://h/t.jpg" }))).toMatchObject({
      thumbnailUrl: "http://h/t.jpg",
    });
  });

  it("refuse un événement sans occurredAt", () => {
    expect(schema.safeParse(makeEvent(type, { occurredAt: undefined })).success).toBe(false);
  });

  it.each([
    ["sans identifiant", { id: undefined }],
    ["avec un identifiant qui n'est pas un UUID", { id: "evt-1" }],
    ["d'un autre type", { type: otherType }],
    ["sans canal", { channelId: undefined }],
    ["avec un canal vide", { channelId: "" }],
    ["sans session", { sessionId: undefined }],
    ["avec une session vide", { sessionId: "" }],
    ["avec un instant sans fuseau", { occurredAt: "2026-10-15T20:00:00" }],
    ["avec un instant qui n'est pas une date", { occurredAt: "hier" }],
  ])("refuse un événement %s", (_name, overrides) => {
    expect(schema.safeParse(makeEvent(type, overrides)).success).toBe(false);
  });
});

describe("VideoEvent", () => {
  it.each(["stream.started", "stream.ended"])("décode un événement %s connu", (type) => {
    expect(VideoEvent.parse(makeEvent(type))).toEqual(makeEvent(type));
  });

  it("décode un type d'événement ajouté plus tard par l'émetteur", () => {
    const event = { id: EVENT_ID, type: "stream.thumbnail", occurredAt: OCCURRED_AT, url: "u" };

    expect(VideoEvent.parse(event)).toEqual(event);
  });

  it.each(["stream.started", "stream.ended"])(
    "ne fait pas passer un %s mal formé pour un type inconnu",
    (type) => {
      expect(VideoEvent.safeParse(makeEvent(type, { sessionId: undefined })).success).toBe(false);
    },
  );

  it.each([
    ["sans occurredAt", { occurredAt: undefined }],
    ["sans identifiant", { id: undefined }],
    ["sans type", { type: undefined }],
  ])("refuse un type inconnu %s", (_name, overrides) => {
    expect(VideoEvent.safeParse(makeEvent("stream.thumbnail", overrides)).success).toBe(false);
  });
});
