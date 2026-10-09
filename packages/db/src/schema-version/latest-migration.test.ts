import { describe, expect, it } from "vitest";

import { latestMigration } from "./latest-migration.ts";

describe("latestMigration", () => {
  it("donne la migration la plus récente, quel que soit l'ordre de lecture", () => {
    expect(
      latestMigration(["20261012080000_video", "20261009140042_socle", "20261010090000_outbox"]),
    ).toBe("20261012080000_video");
  });

  it("ignore ce qui n'est pas un dossier de migration", () => {
    expect(
      latestMigration([
        "migration_lock.toml",
        "20261009140042_socle",
        "20261009140042_socle.bak",
        "x20991231000000_brouillon",
        "README.md",
      ]),
    ).toBe("20261009140042_socle");
  });

  it("refuse un dossier sans migration", () => {
    expect(() => latestMigration(["migration_lock.toml"])).toThrow("Aucune migration");
  });
});
