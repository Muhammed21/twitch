import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  chatterKey,
  redisChatterProfiles,
  redisRoomDirectory,
  roomKey,
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
