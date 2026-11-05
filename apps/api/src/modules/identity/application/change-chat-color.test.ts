import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { type ChatColorStore, changeChatColor } from "./change-chat-color.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const storeOf = (userIds: readonly string[]) => {
  const saved: { userId: string; chatColor: string | null }[] = [];
  const store: ChatColorStore = {
    saveChatColor: async (change) => {
      if (!userIds.includes(change.userId)) {
        return err("account_not_found");
      }
      saved.push(change);
      return ok(undefined);
    },
  };
  return { store, saved };
};

describe("modification de la couleur de pseudo (ADR 0051)", () => {
  it("enregistre une couleur #RRGGBB, en majuscules", async () => {
    const { store, saved } = storeOf([USER_ID]);

    expect(await changeChatColor(store)({ userId: USER_ID, chatColor: "#9146ff" })).toEqual(
      ok(undefined),
    );
    expect(saved).toEqual([{ userId: USER_ID, chatColor: "#9146FF" }]);
  });

  it("revient à la couleur par défaut avec null", async () => {
    const { store, saved } = storeOf([USER_ID]);

    await changeChatColor(store)({ userId: USER_ID, chatColor: null });

    expect(saved).toEqual([{ userId: USER_ID, chatColor: null }]);
  });

  it.each(["9146FF", "#FFF", "#9146FFF", "#GGGGGG", " #9146FF", "#9146FF ", "", "violet"])(
    "refuse la couleur %j sans rien enregistrer",
    async (chatColor) => {
      const { store, saved } = storeOf([USER_ID]);

      expect(await changeChatColor(store)({ userId: USER_ID, chatColor })).toEqual(
        err("invalid_chat_color"),
      );
      expect(saved).toEqual([]);
    },
  );

  it("signale un compte disparu", async () => {
    const { store } = storeOf([]);

    expect(await changeChatColor(store)({ userId: USER_ID, chatColor: "#9146FF" })).toEqual(
      err("account_not_found"),
    );
  });
});
