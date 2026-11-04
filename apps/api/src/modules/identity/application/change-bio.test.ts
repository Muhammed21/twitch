import { describe, expect, it } from "vitest";

import { type BioStore, changeBio } from "./change-bio.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const storeOf = (userIds: readonly string[]) => {
  const saved = new Map<string, string | undefined>();
  const store: BioStore = {
    saveBio: async ({ userId, bio }) => {
      if (!userIds.includes(userId)) {
        return false;
      }
      saved.set(userId, bio);
      return true;
    },
  };
  return { store, saved };
};

describe("modification de la bio", () => {
  it("enregistre la bio sans les espaces des bords", async () => {
    const { store, saved } = storeOf([USER_ID]);

    expect(await changeBio(store)({ userId: USER_ID, bio: "  Speedrun le dimanche " })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(saved.get(USER_ID)).toBe("Speedrun le dimanche");
  });

  it("efface la bio quand la saisie est vide", async () => {
    const { store, saved } = storeOf([USER_ID]);

    await changeBio(store)({ userId: USER_ID, bio: "   " });

    expect(saved.has(USER_ID)).toBe(true);
    expect(saved.get(USER_ID)).toBeUndefined();
  });

  it("refuse une bio trop longue sans rien enregistrer", async () => {
    const { store, saved } = storeOf([USER_ID]);

    expect(await changeBio(store)({ userId: USER_ID, bio: "a".repeat(301) })).toEqual({
      ok: false,
      error: "bio_too_long",
    });
    expect(saved.size).toBe(0);
  });

  it("signale un compte qui n'existe plus", async () => {
    const { store } = storeOf([]);

    expect(await changeBio(store)({ userId: USER_ID, bio: "Speedrun" })).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });
});
