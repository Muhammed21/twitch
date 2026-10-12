import { describe, expect, it } from "vitest";

import { channel, type RoleAssignment } from "./ability.ts";
import { inMemoryAuthzContext } from "./authz-context.ts";

const NOW = new Date("2026-10-12T12:00:00.000Z");

const OWNER_OF_A: RoleAssignment = {
  role: "owner",
  scope: { type: "channel", channelId: "channel-a" },
  expiresAt: null,
  revokedAt: null,
};

const context = () =>
  inMemoryAuthzContext({ assignments: { "user-1": [OWNER_OF_A] }, now: () => NOW });

describe("AuthzContext en mémoire, pour les tests de use-case", () => {
  it("rend les attributions d'un utilisateur", async () => {
    expect(await context().assignmentsOf("user-1")).toEqual([OWNER_OF_A]);
  });

  it("rend une liste vide pour un utilisateur sans attribution", async () => {
    expect(await context().assignmentsOf("user-2")).toEqual([]);
  });

  it("construit l'ability des attributions de l'utilisateur", async () => {
    expect((await context().abilityFor("user-1")).can("update", channel("channel-a"))).toBe(true);
    expect((await context().abilityFor("user-2")).can("update", channel("channel-a"))).toBe(false);
  });
});
