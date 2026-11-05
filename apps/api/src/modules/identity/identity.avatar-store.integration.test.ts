import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { prismaAvatarStore } from "./infrastructure/prisma-account-directory.ts";

const identity = createContextClient({ context: "identity", env: process.env });
const store = prismaAvatarStore(identity);

const FIRST_KEY = "images/avatar/premier.webp";
const SECOND_KEY = "images/avatar/second.webp";

const seededUsers: string[] = [];

const avatarEventsOf = async (accountId: string) =>
  (
    await identity.identityOutbox.findMany({
      where: { name: "identity.avatar.changed" },
    })
  )
    .map(({ version, payload }) => ({ version, payload }))
    .filter(
      ({ payload }) =>
        typeof payload === "object" &&
        payload !== null &&
        "accountId" in payload &&
        payload.accountId === accountId,
    );

afterAll(async () => {
  await identity.identityUser.deleteMany({ where: { id: { in: seededUsers } } });
  await identity.$disconnect();
});

const seedUser = async (): Promise<string> => {
  const id = randomUUID();
  await identity.identityUser.create({
    data: { id, name: "Avatar en base", email: `avatar-store-${id}@twitch.local` },
  });
  seededUsers.push(id);
  return id;
};

describe("enregistrement de l'avatar en base", () => {
  it("ne trouve pas de compte pour un identifiant inconnu", async () => {
    expect(await store.saveAvatar({ userId: randomUUID(), avatarKey: FIRST_KEY })).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });

  it("enregistre le premier avatar du compte, sans clé remplacée", async () => {
    const userId = await seedUser();

    expect(await store.saveAvatar({ userId, avatarKey: FIRST_KEY })).toEqual({
      ok: true,
      value: { replacedKey: undefined },
    });
    expect(await store.readAvatarKey(userId)).toBe(FIRST_KEY);
  });

  it("rend l'ancienne clé quand un avatar en remplace un autre", async () => {
    const userId = await seedUser();
    await store.saveAvatar({ userId, avatarKey: FIRST_KEY });

    expect(await store.saveAvatar({ userId, avatarKey: SECOND_KEY })).toEqual({
      ok: true,
      value: { replacedKey: FIRST_KEY },
    });
    expect(await store.readAvatarKey(userId)).toBe(SECOND_KEY);
  });

  it("écrit identity.avatar.changed avec la nouvelle clé, dans la transaction de l'enregistrement", async () => {
    const userId = await seedUser();

    await store.saveAvatar({ userId, avatarKey: FIRST_KEY });
    await store.saveAvatar({ userId, avatarKey: SECOND_KEY });

    const written = await avatarEventsOf(userId);
    expect(written).toHaveLength(2);
    expect(written).toEqual(
      expect.arrayContaining([
        { version: 1, payload: { accountId: userId, avatarKey: FIRST_KEY } },
        { version: 1, payload: { accountId: userId, avatarKey: SECOND_KEY } },
      ]),
    );
  });

  it("n'écrit aucun event pour un compte inconnu", async () => {
    const userId = randomUUID();

    await store.saveAvatar({ userId, avatarKey: FIRST_KEY });

    expect(await avatarEventsOf(userId)).toEqual([]);
  });

  it("relit l'absence d'avatar, pour un compte sans avatar comme pour un compte inconnu", async () => {
    const userId = await seedUser();

    expect(await store.readAvatarKey(userId)).toBeNull();
    expect(await store.readAvatarKey(randomUUID())).toBeNull();
  });
});
