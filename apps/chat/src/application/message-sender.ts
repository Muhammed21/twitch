import type { ChatterContext } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

import {
  acceptMessage,
  type AcceptedMessage,
  type Rejection,
  type RoomState,
  sanctionRejection,
} from "../domain/decide.ts";
import type { RateLimit } from "./ports.ts";

export type MessageSender = ReturnType<typeof createMessageSender>;

export const createMessageSender = (limit: RateLimit) => ({
  send: async ({
    chatter,
    room,
    body,
    now,
  }: {
    chatter: ChatterContext;
    room: RoomState;
    body: string;
    now: Date;
  }): Promise<Result<AcceptedMessage, Rejection>> => {
    const sanction = sanctionRejection({ chatter, channelId: room.channelId, now });
    if (sanction !== undefined) {
      return err(sanction);
    }
    if (!(await limit.take({ userId: chatter.userId, now }))) {
      return err("rate_limited");
    }
    return ok(acceptMessage({ chatter, room, message: { body }, now }));
  },
});
