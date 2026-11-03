import type { ChatterContext } from "@repo/authorization";
import { ok, type Result } from "@repo/result";

import {
  type AcceptedMessage,
  decide,
  isBucketFull,
  type Rejection,
  type RoomState,
  type TokenBucket,
} from "../domain/decide.ts";

export type MessageSender = ReturnType<typeof createMessageSender>;

export const createMessageSender = () => {
  const buckets = new Map<string, TokenBucket>();

  return {
    send: ({
      chatter,
      room,
      body,
      now,
    }: {
      chatter: ChatterContext;
      room: RoomState;
      body: string;
      now: Date;
    }): Result<AcceptedMessage, Rejection> => {
      const decision = decide({
        chatter,
        room,
        message: { body },
        bucket: buckets.get(chatter.userId),
        now,
      });
      if (!decision.ok) {
        return decision;
      }
      buckets.set(chatter.userId, decision.value.bucket);
      return ok(decision.value.message);
    },
    sweep: (now: Date): void => {
      [...buckets]
        .filter(([, bucket]) => isBucketFull({ bucket, now }))
        .forEach(([userId]) => buckets.delete(userId));
    },
    bucketCount: (): number => buckets.size,
  };
};
