import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { prismaAvatarStore } from "./infrastructure/prisma-account-directory.ts";

const identity = createContextClient({ context: "identity", env: process.env });
const store = prismaAvatarStore(identity);

const FIRST_KEY = "images/avatar/premier.webp";
const SECOND_KEY = "images/avatar/second.webp";

const seededUsers: string[] = [];

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

  it("relit l'absence d'avatar, pour un compte sans avatar comme pour un compte inconnu", async () => {
    const userId = await seedUser();

    expect(await store.readAvatarKey(userId)).toBeNull();
    expect(await store.readAvatarKey(randomUUID())).toBeNull();
  });
});
