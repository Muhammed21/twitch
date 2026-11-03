import { describe, expect, it } from "vitest";

import { parseStreamEntry } from "./stream-entry.ts";

const makeEntry = (overrides: Record<string, string> = {}): Record<string, string> => ({
  id: "7f3c2a10-0000-4000-8000-000000000001",
  name: "identity.account.registered",
  version: "1",
  occurredAt: "2026-10-15T09:30:00.000Z",
  payload: '{"accountId":"0b6e1f2a-0000-4000-8000-000000000002","displayName":"Streamer"}',
  ...overrides,
});

describe("lecture d'une entrée écrite par le relais d'outbox de l'API", () => {
  it("rend le nom, la version, l'instant de l'event et le payload décodé", () => {
    expect(parseStreamEntry(makeEntry())).toEqual({
      name: "identity.account.registered",
      version: 1,
      occurredAt: new Date("2026-10-15T09:30:00.000Z"),
      payload: { accountId: "0b6e1f2a-0000-4000-8000-000000000002", displayName: "Streamer" },
    });
  });

  it("lit une version à plusieurs chiffres", () => {
    expect(parseStreamEntry(makeEntry({ version: "12" }))).toMatchObject({ version: 12 });
  });

  it.each([
    ["sans nom", { name: "" }],
    ["avec une version qui n'est pas un entier", { version: "1.5" }],
    ["avec une version nulle", { version: "0" }],
    ["avec une version suivie de texte", { version: "1a" }],
    ["avec un payload qui n'est pas du JSON", { payload: "{" }],
    ["avec un instant qui n'est pas une date ISO", { occurredAt: "hier" }],
  ])("refuse une entrée %s", (_name, overrides) => {
    expect(parseStreamEntry(makeEntry(overrides))).toBeNull();
  });

  it("refuse une entrée sans payload", () => {
    const { payload: _payload, ...entry } = makeEntry();

    expect(parseStreamEntry(entry)).toBeNull();
  });

  it("refuse une entrée sans instant", () => {
    const { occurredAt: _occurredAt, ...entry } = makeEntry();

    expect(parseStreamEntry(entry)).toBeNull();
  });
});
