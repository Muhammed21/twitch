import { describe, expect, it } from "vitest";

import { appendToOutbox, backoffDelay, qualifiedTable, type SqlExecutor } from "./index.ts";

const neverCalled: SqlExecutor = {
  $executeRaw: () => {
    throw new Error("aucune requête ne doit partir");
  },
};

describe("backoffDelay", () => {
  it.each([
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [9, 256_000],
  ])("attend, après %i échec(s), %i ms", (attempts, delay) => {
    expect(backoffDelay(attempts)).toBe(delay);
  });

  it.each([10, 30])("plafonne l'attente à 5 minutes après %i échecs", (attempts) => {
    expect(backoffDelay(attempts)).toBe(300_000);
  });
});

describe("qualifiedTable", () => {
  it("cite le schéma et la table", () => {
    expect(qualifiedTable({ schema: "video", table: "VideoOutbox" })).toBe('"video"."VideoOutbox"');
  });

  it.each([
    { schema: "video", table: 'VideoOutbox"; DROP TABLE x; --' },
    { schema: "video; --", table: "VideoOutbox" },
    { schema: "video", table: "1Outbox" },
    { schema: "", table: "VideoOutbox" },
    { schema: "video", table: "" },
    { schema: "vidéo", table: "VideoOutbox" },
  ])("refuse un identifiant qui n'est pas un nom simple : $schema.$table", (ref) => {
    expect(() => qualifiedTable(ref)).toThrow("Table invalide");
  });

  it("refuse la table avant d'écrire quoi que ce soit", async () => {
    await expect(
      appendToOutbox(neverCalled, {
        outbox: { schema: "video", table: "x y" },
        event: {
          id: "00000000-0000-0000-0000-000000000000",
          name: "video.stream.started",
          version: 1,
          payload: {},
          occurredAt: new Date(),
        },
      }),
    ).rejects.toThrow("Table invalide");
  });
});
