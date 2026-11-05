import { describe, expect, it } from "vitest";

import {
  type AccountDirectory,
  type BannerUrlOf,
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

const imageUrlOf = (key: string) => `https://images.twitch.example/${key}`;

const NO_BANNER: BannerUrlOf = async () => undefined;

const BANNER_URL = "https://images.twitch.example/images/banner/b.webp";

const bannerUrlOf =
  (userId: string, url: string): BannerUrlOf =>
  async (id) =>
    id === userId ? url : undefined;

const lastLiveOf =
  (userId: string, startedAt: Date): LastLiveOf =>
  async (id) =>
    id === userId ? startedAt : undefined;

describe("compte de l'utilisateur authentifié", () => {
  it("rend le compte de l'identifiant du jeton", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([ACCOUNT]),
      lastLiveOf: NEVER_STREAMED,
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
    });

    expect(await read(ACCOUNT.id)).toEqual({ ok: true, value: ACCOUNT });
  });

  it("rend l'URL publique de l'avatar, sans sa clé de stockage", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([{ ...ACCOUNT, avatarKey: "images/avatar/a.webp" }]),
      lastLiveOf: NEVER_STREAMED,
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
    });

    expect(await read(ACCOUNT.id)).toStrictEqual({
      ok: true,
      value: { ...ACCOUNT, avatarUrl: "https://images.twitch.example/images/avatar/a.webp" },
    });
  });

  it("rend l'URL de la bannière de la chaîne de l'utilisateur", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([ACCOUNT]),
      lastLiveOf: NEVER_STREAMED,
      imageUrlOf,
      bannerUrlOf: bannerUrlOf(ACCOUNT.id, BANNER_URL),
    });

    expect(await read(ACCOUNT.id)).toStrictEqual({
      ok: true,
      value: { ...ACCOUNT, bannerUrl: BANNER_URL },
    });
  });

  it("rend la bio écrite par l'utilisateur", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([{ ...ACCOUNT, bio: "Speedrun le dimanche" }]),
      lastLiveOf: NEVER_STREAMED,
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
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
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
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
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
    });

    const account = await read(ACCOUNT.id);

    expect(account.ok && Object.keys(account.value)).toEqual(["id", "name", "email"]);
  });

  it("signale un compte qui n'existe plus", async () => {
    const read = getCurrentAccount({
      directory: directoryOf([]),
      lastLiveOf: lastLiveOf(ACCOUNT.id, LAST_LIVE),
      imageUrlOf,
      bannerUrlOf: NO_BANNER,
    });

    expect(await read(ACCOUNT.id)).toEqual({ ok: false, error: "account_not_found" });
  });
});
