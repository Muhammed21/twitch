import { describe, expect, it } from "vitest";

import { events } from "@repo/contracts";
import type { OutboxEvent } from "@repo/db";

import { STREAM_MAX_LENGTH, streamOf, toStreamEntry } from "./stream-entry.ts";

const makeEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: "7f3c2a10-0000-4000-8000-000000000001",
  name: events.identity.accountRegistered.name,
  version: events.identity.accountRegistered.version,
  payload: { accountId: "0b6e1f2a-0000-4000-8000-000000000002" },
  occurredAt: new Date("2026-10-15T09:30:00.000Z"),
  ...overrides,
});

describe("stream d'une outbox", () => {
  it("publie l'outbox d'un contexte sur le stream events.<contexte>", () => {
    expect(streamOf({ schema: "identity", table: "IdentityOutbox" })).toBe("events.identity");
  });

  it("coupe chaque stream à environ 100 000 entrées (ADR 0034)", () => {
    expect(STREAM_MAX_LENGTH).toBe(100_000);
  });
});

describe("entrée de stream d'un event", () => {
  it("porte l'identifiant, le nom, la version, la date en UTC et le payload en JSON", () => {
    expect(toStreamEntry(makeEvent())).toEqual({
      id: "7f3c2a10-0000-4000-8000-000000000001",
      name: "identity.account.registered",
      version: "1",
      occurredAt: "2026-10-15T09:30:00.000Z",
      payload: '{"accountId":"0b6e1f2a-0000-4000-8000-000000000002"}',
    });
  });

  it("se relit avec le schéma du contrat", () => {
    const event = makeEvent();
    const entry = toStreamEntry(event);

    expect(events.identity.accountRegistered.payload.parse(JSON.parse(entry.payload))).toEqual(
      event.payload,
    );
  });
});
