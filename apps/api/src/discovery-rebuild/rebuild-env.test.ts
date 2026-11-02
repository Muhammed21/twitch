import { describe, expect, it } from "vitest";

import { loadRebuildEnv } from "./rebuild-env.ts";

const OUTBOX_URL = "postgresql://app_projection_rebuild:secret@127.0.0.1:5432/app";

describe("configuration de la reconstruction de discovery", () => {
  it("accepte le schéma court postgres://", () => {
    expect(loadRebuildEnv({ DATABASE_URL_PROJECTION_REBUILD: "postgres://h/app" })).toEqual({
      historyDatabaseUrl: "postgres://h/app",
    });
  });

  it("lit l'URL de lecture des outbox", () => {
    expect(loadRebuildEnv({ DATABASE_URL_PROJECTION_REBUILD: OUTBOX_URL })).toEqual({
      historyDatabaseUrl: OUTBOX_URL,
    });
  });

  it.each([
    undefined,
    "",
    "mysql://h/app",
    "postgresql://h/app avec espace",
    "jdbc:postgresql://h/app",
  ])("refuse DATABASE_URL_PROJECTION_REBUILD %j en la nommant", (url) => {
    expect(() => loadRebuildEnv({ DATABASE_URL_PROJECTION_REBUILD: url })).toThrow(
      "DATABASE_URL_PROJECTION_REBUILD",
    );
  });
});
