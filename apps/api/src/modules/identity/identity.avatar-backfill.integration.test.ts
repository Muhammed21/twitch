import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { prismaAvatarStore } from "./infrastructure/prisma-account-directory.ts";

const identity = createContextClient({ context: "identity", env: process.env });

const BACKFILL = readFileSync(
  new URL(
    "../../../../../packages/db/prisma/migrations/20261107090000_identity_avatar_changed_backfill/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

const AVATAR_KEY = "images/avatar/avant-l-event.webp";

const seededUsers: string[] = [];

afterAll(async () => {
  await identity.identityUser.deleteMany({ where: { id: { in: seededUsers } } });
  await identity.$disconnect();
});

const seedUser = async ({ avatarKey }: { avatarKey: string | null }): Promise<string> => {
  const id = randomUUID();
  await identity.identityUser.create({
    data: {
      id,
      name: "Avatar à rattraper",
      email: `avatar-backfill-${id}@twitch.local`,
      avatarKey,
    },
  });
  seededUsers.push(id);
  return id;
};

const avatarEventsOf = async (accountId: string) =>
  (await identity.identityOutbox.findMany({ where: { name: "identity.avatar.changed" } }))
    .filter(
      ({ payload }) =>
        typeof payload === "object" &&
        payload !== null &&
        "accountId" in payload &&
        payload.accountId === accountId,
    )
    .map(({ version, payload, publishedAt }) => ({ version, payload, publishedAt }));

const runBackfill = () => identity.$executeRawUnsafe(BACKFILL);

describe("rattrapage des avatars posés avant identity.avatar.changed", () => {
  it("écrit l'event de l'avatar d'un compte, à publier par le relais", async () => {
    const accountId = await seedUser({ avatarKey: AVATAR_KEY });

    await runBackfill();

    expect(await avatarEventsOf(accountId)).toEqual([
      { version: 1, payload: { accountId, avatarKey: AVATAR_KEY }, publishedAt: null },
    ]);
  });

  it("n'écrit rien pour un compte sans avatar", async () => {
    const accountId = await seedUser({ avatarKey: null });

    await runBackfill();

    expect(await avatarEventsOf(accountId)).toEqual([]);
  });

  it("n'écrit rien pour un avatar déjà annoncé par un event", async () => {
    const accountId = await seedUser({ avatarKey: null });
    await prismaAvatarStore(identity).saveAvatar({ userId: accountId, avatarKey: AVATAR_KEY });

    await runBackfill();
    await runBackfill();

    expect(await avatarEventsOf(accountId)).toHaveLength(1);
  });
});
