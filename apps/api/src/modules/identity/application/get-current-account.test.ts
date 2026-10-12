import { describe, expect, it } from "vitest";

import { type AccountDirectory, getCurrentAccount } from "./get-current-account.ts";

const ACCOUNT = {
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Viewer de test",
  email: "viewer@twitch.local",
};

const directoryOf = (accounts: readonly (typeof ACCOUNT)[]): AccountDirectory => ({
  findById: async (id) => accounts.find((account) => account.id === id) ?? null,
});

describe("compte de l'utilisateur authentifié", () => {
  it("rend le compte de l'identifiant du jeton", async () => {
    expect(await getCurrentAccount(directoryOf([ACCOUNT]))(ACCOUNT.id)).toEqual({
      ok: true,
      value: ACCOUNT,
    });
  });

  it("signale un compte qui n'existe plus", async () => {
    expect(await getCurrentAccount(directoryOf([]))(ACCOUNT.id)).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });
});
