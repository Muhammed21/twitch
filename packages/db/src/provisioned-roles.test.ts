import { describe, expect, it } from "vitest";

import { assertRolesProvisioned, contexts, expectedRoles } from "./index.ts";

const listing = (roles: readonly string[]) => () => Promise.resolve(roles);

const withoutRole = (role: string) => expectedRoles.filter((expected) => expected !== role);

describe("expectedRoles", () => {
  it("attend migrator, un rôle par contexte, le relais de l'outbox et la sonde de santé", () => {
    expect(expectedRoles).toEqual([
      "migrator",
      ...contexts.map((context) => `app_${context}`),
      "app_outbox_relay",
      "app_health",
    ]);
  });
});

describe("assertRolesProvisioned", () => {
  it("passe quand tous les rôles attendus existent", async () => {
    await expect(
      assertRolesProvisioned({ listRoles: listing([...expectedRoles, "postgres"]) }),
    ).resolves.toBeUndefined();
  });

  it("échoue en nommant le rôle manquant", async () => {
    await expect(
      assertRolesProvisioned({ listRoles: listing(withoutRole("app_video")) }),
    ).rejects.toThrow("app_video");
  });

  it("nomme tous les rôles manquants", async () => {
    await expect(assertRolesProvisioned({ listRoles: listing(["migrator"]) })).rejects.toThrow(
      expectedRoles.slice(1).join(", "),
    );
  });
});
