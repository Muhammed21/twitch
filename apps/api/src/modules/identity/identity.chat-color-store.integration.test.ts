import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import {
  prismaAccountDirectory,
  prismaChatColorStore,
} from "./infrastructure/prisma-account-directory.ts";

const identity = createContextClient({ context: "identity", env: process.env });
const store = prismaChatColorStore(identity);
const directory = prismaAccountDirectory(identity);

const PURPLE = "#9146FF";
const GREEN = "#00FF7F";

const seededUsers: string[] = [];

const chatColorEventsOf = async (accountId: string) =>
  (
    await identity.identityOutbox.findMany({
      where: { name: "identity.chat_color.changed" },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
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
    data: { id, name: "Couleur en base", email: `chat-color-${id}@twitch.local` },
  });
  seededUsers.push(id);
  return id;
};

describe("enregistrement de la couleur de pseudo en base (ADR 0051)", () => {
  it("ne trouve pas de compte pour un identifiant inconnu, et n'écrit pas d'event", async () => {
    const userId = randomUUID();

    expect(await store.saveChatColor({ userId, chatColor: PURPLE })).toEqual({
      ok: false,
      error: "account_not_found",
    });
    expect(await chatColorEventsOf(userId)).toEqual([]);
  });

  it("enregistre la couleur et écrit identity.chat_color.changed dans la même transaction", async () => {
    const userId = await seedUser();

    expect(await store.saveChatColor({ userId, chatColor: PURPLE })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await directory.findById(userId)).toMatchObject({ chatColor: PURPLE });
    expect(await chatColorEventsOf(userId)).toEqual([
      { version: 1, payload: { accountId: userId, chatColor: PURPLE } },
    ]);
  });

  it("n'écrit qu'un event pour la même couleur deux fois", async () => {
    const userId = await seedUser();

    await store.saveChatColor({ userId, chatColor: PURPLE });
    await store.saveChatColor({ userId, chatColor: PURPLE });

    expect(await chatColorEventsOf(userId)).toHaveLength(1);
  });

  it("efface la couleur avec null et écrit l'event du retour au défaut", async () => {
    const userId = await seedUser();
    await store.saveChatColor({ userId, chatColor: GREEN });

    await store.saveChatColor({ userId, chatColor: null });

    expect(await directory.findById(userId)).not.toHaveProperty("chatColor");
    expect(await chatColorEventsOf(userId)).toEqual([
      { version: 1, payload: { accountId: userId, chatColor: GREEN } },
      { version: 1, payload: { accountId: userId, chatColor: null } },
    ]);
  });

  it("n'écrit pas d'event pour effacer une couleur jamais choisie", async () => {
    const userId = await seedUser();

    await store.saveChatColor({ userId, chatColor: null });

    expect(await chatColorEventsOf(userId)).toEqual([]);
  });
});
