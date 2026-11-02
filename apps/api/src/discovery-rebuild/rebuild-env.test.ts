import { describe, expect, it } from "vitest";

import { loadRebuildEnv } from "./rebuild-env.ts";

const OUTBOX_URL = "postgresql://app_outbox_relay:secret@127.0.0.1:5432/app";

describe("configuration de la reconstruction de discovery", () => {
  it("lit l'URL de lecture des outbox", () => {
    expect(loadRebuildEnv({ DATABASE_URL_OUTBOX_RELAY: OUTBOX_URL })).toEqual({
      outboxDatabaseUrl: OUTBOX_URL,
    });
  });

  it.each([undefined, "", "mysql://h/app", "postgresql://h/app avec espace"])(
    "refuse DATABASE_URL_OUTBOX_RELAY %j en la nommant",
    (url) => {
      expect(() => loadRebuildEnv({ DATABASE_URL_OUTBOX_RELAY: url })).toThrow(
        "DATABASE_URL_OUTBOX_RELAY",
      );
    },
  );
});
