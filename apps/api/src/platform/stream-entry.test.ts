import { describe, expect, it } from "vitest";

import { events } from "@repo/contracts";
import type { OutboxEvent } from "@repo/db";

import { parseStreamEntry, STREAM_MAX_LENGTH, streamOf, toStreamEntry } from "./stream-entry.ts";

const makeEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: "7f3c2a10-0000-4000-8000-000000000001",
  name: events.identity.accountRegistered.name,
  version: events.identity.accountRegistered.version,
  payload: { accountId: "0b6e1f2a-0000-4000-8000-000000000002", displayName: "Streamer" },
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
      payload: '{"accountId":"0b6e1f2a-0000-4000-8000-000000000002","displayName":"Streamer"}',
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

const makeEntry = (overrides: Record<string, string> = {}) => ({
  id: "7f3c2a10-0000-4000-8000-000000000001",
  name: "identity.account.registered",
  version: "1",
  occurredAt: "2026-10-15T09:30:00.000Z",
  payload: '{"accountId":"0b6e1f2a-0000-4000-8000-000000000002","displayName":"Streamer"}',
  ...overrides,
});

describe("lecture d'une entrée de stream", () => {
  it("rend l'event écrit par toStreamEntry", () => {
    const event = makeEvent();

    expect(parseStreamEntry(toStreamEntry(event))).toEqual(event);
  });

  it("lit une version à plusieurs chiffres", () => {
    expect(parseStreamEntry(makeEntry({ version: "12" }))).toMatchObject({ version: 12 });
  });

  it("garde les champs ajoutés plus tard par le relais", () => {
    expect(parseStreamEntry({ ...makeEntry(), traceId: "abc" })).toMatchObject({
      name: "identity.account.registered",
    });
  });

  it.each([
    ["sans identifiant", { id: "" }],
    ["avec un identifiant qui n'est pas un UUID", { id: "event-1" }],
    ["sans nom", { name: "" }],
    ["avec une version qui n'est pas un entier", { version: "1.5" }],
    ["avec une version nulle", { version: "0" }],
    ["avec une date illisible", { occurredAt: "hier" }],
    ["avec une date sans fuseau", { occurredAt: "2026-10-15T09:30:00" }],
    ["avec un payload qui n'est pas du JSON", { payload: "{accountId" }],
  ])("refuse une entrée %s", (_name, overrides) => {
    expect(parseStreamEntry(makeEntry(overrides))).toBeNull();
  });

  it.each(["id", "name", "version", "occurredAt", "payload"])(
    "refuse une entrée sans le champ %s",
    (field) => {
      const entry = Object.fromEntries(
        Object.entries(makeEntry()).filter(([key]) => key !== field),
      );

      expect(parseStreamEntry(entry)).toBeNull();
    },
  );
});
