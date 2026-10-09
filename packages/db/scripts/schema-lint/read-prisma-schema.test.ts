import { describe, expect, it } from "vitest";

import { lintSchema, personalInventory } from "../../src/schema-lint/lint-schema.ts";
import { readPrismaSchema } from "./read-prisma-schema.ts";

const fixture = (name: string) => new URL(`./fixtures/${name}/`, import.meta.url).pathname;

const messagesFor = async (name: string) =>
  lintSchema(await readPrismaSchema(fixture(name))).map((violation) => violation.message);

describe("lint d'un schéma Prisma réel", () => {
  it("accepte un schéma conforme réparti sur plusieurs fichiers, relation interne comprise", async () => {
    expect(await messagesFor("compliant")).toEqual([]);
  });

  it.each([
    [
      "cross-schema-relation",
      [
        "video.VideoStream.room : relation vers chat.ChatRoom, hors du schéma video",
        "chat.ChatRoom.streams : relation vers video.VideoStream, hors du schéma chat",
      ],
    ],
    ["cross-schema-enum", ["chat.ChatRoom.state : enum video.VideoState, hors du schéma chat"]],
    ["unprefixed-model", ["video.Stream : le nom doit commencer par Video"]],
    ["unprefixed-enum", ["video.State : le nom doit commencer par Video"]],
    [
      "unannotated-personal",
      ["chat.ChatMessage.authorId : ajouter /// @personal ou /// @not-personal"],
    ],
  ])("détecte la violation %s", async (name, expected) => {
    expect(await messagesFor(name)).toEqual(expected);
  });

  it("inventorie les champs @personal, annotation sur plusieurs lignes comprise", async () => {
    expect(personalInventory(await readPrismaSchema(fixture("compliant")))).toEqual([
      "chat.ChatMessage.authorId",
      "video.VideoStream.viewerId",
    ]);
  });
});
