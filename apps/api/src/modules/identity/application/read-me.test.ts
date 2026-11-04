import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { Account } from "./get-current-account.ts";
import { type OwnedChannel, readMe } from "./read-me.ts";

const ACCOUNT: Account = {
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Viewer de test",
  email: "viewer@twitch.local",
};

const CHANNEL: OwnedChannel = {
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "viewer_de_test",
};

const channelsOf =
  (owned: Readonly<Record<string, OwnedChannel>>) =>
  async (ownerId: string): Promise<OwnedChannel | null> =>
    owned[ownerId] ?? null;

describe("compte de l'utilisateur authentifié, avec sa chaîne", () => {
  it("ajoute la chaîne dont le compte est propriétaire", async () => {
    const read = readMe({
      currentAccount: async () => ok(ACCOUNT),
      ownedChannel: channelsOf({ [ACCOUNT.id]: CHANNEL }),
    });

    expect(await read(ACCOUNT.id)).toEqual(ok({ ...ACCOUNT, channel: CHANNEL }));
  });

  it("rend le compte sans chaîne tant que sa chaîne n'est pas créée", async () => {
    const read = readMe({ currentAccount: async () => ok(ACCOUNT), ownedChannel: channelsOf({}) });

    expect(await read(ACCOUNT.id)).toEqual(ok(ACCOUNT));
  });

  it("signale un compte qui n'existe plus", async () => {
    const read = readMe({
      currentAccount: async () => err("account_not_found"),
      ownedChannel: channelsOf({ [ACCOUNT.id]: CHANNEL }),
    });

    expect(await read(ACCOUNT.id)).toEqual(err("account_not_found"));
  });
});
