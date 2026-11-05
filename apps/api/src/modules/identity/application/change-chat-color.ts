import { err, type Result } from "@repo/result";

export interface ChatColorStore {
  saveChatColor(change: {
    userId: string;
    chatColor: string | null;
  }): Promise<Result<void, "account_not_found">>;
}

export type ChatColorChangeError = "invalid_chat_color" | "account_not_found";

const CHAT_COLOR = /^#[0-9a-f]{6}$/i;

export const changeChatColor =
  (store: ChatColorStore) =>
  async ({
    userId,
    chatColor,
  }: {
    userId: string;
    chatColor: string | null;
  }): Promise<Result<void, ChatColorChangeError>> => {
    if (chatColor !== null && !CHAT_COLOR.test(chatColor)) {
      return err("invalid_chat_color");
    }
    return store.saveChatColor({ userId, chatColor: chatColor?.toUpperCase() ?? null });
  };
