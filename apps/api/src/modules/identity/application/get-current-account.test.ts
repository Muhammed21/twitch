import { describe, expect, it } from "vitest";

import {
  type AccountDirectory,
  getCurrentAccount,
  type LastLiveOf,
  type StoredAccount,
} from "./get-current-account.ts";

const ACCOUNT: StoredAccount = {
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Viewer de test",
  email: "viewer@twitch.local",
};

const LAST_LIVE = new Date("2026-11-03T20:15:00.000Z");

const directoryOf = (accounts: readonly StoredAccount[]): AccountDirectory => ({
  findById: async (id) => accounts.find((account) => account.id === id) ?? null,
});

const NEVER_STREAMED: LastLiveOf = async () => undefined;

const lastLiveOf =
  (userId: string, startedAt: Date): LastLiveOf =>
  async (id) =>
    id === userId ? startedAt : undefined;

describe("compte de l'utilisateur authentifié", () => {
  it("rend le compte de l'identifiant du jeton", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([ACCOUNT]),
      lastLiveOf: NEVER_STREAMED,
    });

    expect(await read(ACCOUNT.id)).toEqual({ ok: true, value: ACCOUNT });
  });

  it("rend la bio écrite par l'utilisateur", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([{ ...ACCOUNT, bio: "Speedrun le dimanche" }]),
      lastLiveOf: NEVER_STREAMED,
    });

    expect(await read(ACCOUNT.id)).toEqual({
      ok: true,
      value: { ...ACCOUNT, bio: "Speedrun le dimanche" },
    });
  });

  it("rend le début du dernier live de l'utilisateur", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([ACCOUNT]),
      lastLiveOf: lastLiveOf(ACCOUNT.id, LAST_LIVE),
    });

    expect(await read(ACCOUNT.id)).toEqual({
      ok: true,
      value: { ...ACCOUNT, lastLiveAt: LAST_LIVE },
    });
  });

  it("n'ajoute pas de dernier live à un compte qui n'a jamais streamé", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([ACCOUNT]),
      lastLiveOf: NEVER_STREAMED,
    });

    const account = await read(ACCOUNT.id);

    expect(account.ok && Object.keys(account.value)).toEqual(["id", "name", "email"]);
  });

  it("signale un compte qui n'existe plus", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([]),
      lastLiveOf: lastLiveOf(ACCOUNT.id, LAST_LIVE),
    });

    expect(await read(ACCOUNT.id)).toEqual({ ok: false, error: "account_not_found" });
  });
});
