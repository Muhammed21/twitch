import { describe, expect, it } from "vitest";

import { checkMigrationOrder, type Migration } from "./check-migration-order.ts";

const makeMigration = (name: string, checksum: string = `sql-${name}`): Migration => ({
  name,
  checksum,
});

const BASE: readonly Migration[] = [
  makeMigration("20261009140042_socle"),
  makeMigration("20261104170000_discovery_categories"),
  makeMigration("20261106120000_channel_banner_key"),
];

describe("checkMigrationOrder", () => {
  it("accepte des migrations d'horodatages distincts, toutes déjà sur la branche de base", () => {
    expect(checkMigrationOrder({ current: BASE, base: BASE })).toEqual([]);
  });

  it("refuse deux migrations qui partagent un horodatage", () => {
    expect(
      checkMigrationOrder({
        current: [
          makeMigration("20261105120000_discovery_category_tags"),
          makeMigration("20261105120000_identity_user_avatar_key"),
          makeMigration("20261106120000_channel_banner_key"),
        ],
        base: [],
      }),
    ).toEqual([
      "Horodatage 20261105120000 partagé par 20261105120000_discovery_category_tags, 20261105120000_identity_user_avatar_key",
    ]);
  });

  it("accepte une nouvelle migration postérieure à la dernière de la branche de base", () => {
    expect(
      checkMigrationOrder({
        current: [...BASE, makeMigration("20261106120001_channel_trailer_key")],
        base: BASE,
      }),
    ).toEqual([]);
  });

  it("refuse une nouvelle migration au même horodatage que la dernière de la branche de base", () => {
    expect(
      checkMigrationOrder({
        current: [...BASE, makeMigration("20261106120000_channel_trailer_key")],
        base: BASE,
      }),
    ).toContain(
      "20261106120000_channel_trailer_key doit être postérieure à 20261106120000_channel_banner_key, la dernière migration de la branche de base",
    );
  });

  it("refuse une nouvelle migration antérieure à la dernière de la branche de base", () => {
    expect(
      checkMigrationOrder({
        current: [...BASE, makeMigration("20261105000000_channel_trailer_key")],
        base: BASE,
      }),
    ).toEqual([
      "20261105000000_channel_trailer_key doit être postérieure à 20261106120000_channel_banner_key, la dernière migration de la branche de base",
    ]);
  });

  it("reconnaît une migration de la branche de base renommée à son contenu", () => {
    expect(
      checkMigrationOrder({
        current: [
          makeMigration("20261104170001_identity_user_bio", "sql-bio"),
          makeMigration("20261106120000_channel_banner_key"),
        ],
        base: [
          makeMigration("20261104170000_identity_user_bio", "sql-bio"),
          makeMigration("20261106120000_channel_banner_key"),
        ],
      }),
    ).toEqual([]);
  });

  it("refuse une migration de la branche de base dont le contenu a changé, sans pousser à la renommer", () => {
    expect(
      checkMigrationOrder({
        current: [
          makeMigration("20261009140042_socle"),
          makeMigration("20261104170000_discovery_categories", "sql-modifié"),
          makeMigration("20261106120000_channel_banner_key"),
        ],
        base: BASE,
      }),
    ).toEqual([
      "20261104170000_discovery_categories modifiée : une migration livrée ne change pas, ajoutez-en une nouvelle",
    ]);
  });

  it("refuse la dernière migration de la branche de base quand son contenu a changé", () => {
    expect(
      checkMigrationOrder({
        current: [
          makeMigration("20261009140042_socle"),
          makeMigration("20261104170000_discovery_categories"),
          makeMigration("20261106120000_channel_banner_key", "sql-modifié"),
        ],
        base: BASE,
      }),
    ).toEqual([
      "20261106120000_channel_banner_key modifiée : une migration livrée ne change pas, ajoutez-en une nouvelle",
    ]);
  });

  it("accepte toute migration quand la branche de base n'en a aucune", () => {
    expect(
      checkMigrationOrder({ current: [makeMigration("20261009140042_socle")], base: [] }),
    ).toEqual([]);
  });

  it("compare à la plus récente de la branche de base, quel que soit l'ordre de lecture", () => {
    expect(
      checkMigrationOrder({
        current: [...BASE, makeMigration("20261105000000_channel_trailer_key")],
        base: BASE.toReversed(),
      }),
    ).toHaveLength(1);
  });
});
