import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  chatterKey,
  redisChatterProfiles,
  redisRoomDirectory,
  roomKey,
  sanctionsKey,
} from "./redis-local-views.ts";

const makeHashes = (hashes: Readonly<Record<string, Record<string, string>>>) => ({
  hGetAll: async (key: string) => hashes[key] ?? {},
  hGet: async (key: string, field: string) => hashes[key]?.[field] ?? null,
});

describe("vue locale des salons", () => {
  it("lit hors live le salon d'une chaîne dont la session est vide", async () => {
    const channelId = randomUUID();
    const directory = redisRoomDirectory(makeHashes({ [roomKey(channelId)]: { sessionId: "" } }));

    expect(await directory.find(channelId)).toEqual({ channelId, sessionId: null });
  });

  it("lit en live le salon d'une chaîne dont la session est posée", async () => {
    const channelId = randomUUID();
    const sessionId = randomUUID();
    const directory = redisRoomDirectory(makeHashes({ [roomKey(channelId)]: { sessionId } }));

    expect(await directory.find(channelId)).toEqual({ channelId, sessionId });
  });

  it("ne trouve aucun salon pour une chaîne absente de la vue", async () => {
    expect(await redisRoomDirectory(makeHashes({})).find(randomUUID())).toBeUndefined();
  });

  it("range le salon sous chat:room:<channelId>", () => {
    expect(roomKey("c1")).toBe("chat:room:c1");
  });
});

describe("vue locale des profils", () => {
  it("lit le nom affiché d'un chatter connu, et rien pour un inconnu", async () => {
    const userId = randomUUID();
    const profiles = redisChatterProfiles(
      makeHashes({ [chatterKey(userId)]: { displayName: "Alice" } }),
    );

    expect(await profiles.displayNameOf(userId)).toBe("Alice");
    expect(await profiles.displayNameOf(randomUUID())).toBeNull();
  });

  it("range le profil sous chat:chatter:<userId>", () => {
    expect(chatterKey("u1")).toBe("chat:chatter:u1");
  });
});

describe("vue locale des sanctions", () => {
  it("lit la fin de chaque timeout d'un chatter, par salon", async () => {
    const userId = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    const profiles = redisChatterProfiles(
      makeHashes({
        [sanctionsKey(userId)]: {
          [first]: String(Date.parse("2026-11-03T20:10:00.000Z")),
          [second]: String(Date.parse("2026-11-03T21:00:00.000Z")),
        },
      }),
    );

    expect(await profiles.sanctionsOf(userId)).toEqual([
      { channelId: first, expiresAt: new Date("2026-11-03T20:10:00.000Z") },
      { channelId: second, expiresAt: new Date("2026-11-03T21:00:00.000Z") },
    ]);
  });

  it("ne lit aucune sanction pour un chatter jamais sanctionné", async () => {
    expect(await redisChatterProfiles(makeHashes({})).sanctionsOf(randomUUID())).toEqual([]);
  });

  it("écarte une fin de timeout illisible", async () => {
    const userId = randomUUID();
    const kept = randomUUID();
    const profiles = redisChatterProfiles(
      makeHashes({
        [sanctionsKey(userId)]: {
          [randomUUID()]: "demain",
          [randomUUID()]: "x1000",
          [randomUUID()]: "1000x",
          [kept]: "1000",
        },
      }),
    );

    expect(await profiles.sanctionsOf(userId)).toEqual([
      { channelId: kept, expiresAt: new Date(1000) },
    ]);
  });

  it("range les sanctions sous chat:chatter:<userId>:sanctions", () => {
    expect(sanctionsKey("u1")).toBe("chat:chatter:u1:sanctions");
  });
});
