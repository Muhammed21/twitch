import { activeSanction, type ChatterContext } from "@repo/authorization";
import { err, ok, type Result } from "@repo/result";

const BURST = 5;
const MILLISECONDS_PER_TOKEN = 1000;

export type TokenBucket = { readonly tokens: number; readonly refilledAt: Date };

export type RoomState = { readonly channelId: string; readonly sessionId: string | null };

export type ChatMessage = { readonly channelId: string; readonly body: string };

export type AcceptedMessage = ChatMessage & {
  readonly authorId: string;
  readonly sentAt: Date;
  readonly sessionId?: string;
};

export type Rejection = "timed_out" | "banned" | "rate_limited";

export type Accepted = { readonly message: AcceptedMessage; readonly bucket: TokenBucket };

const refill = (bucket: TokenBucket | undefined, now: Date): number =>
  bucket === undefined
    ? BURST
    : Math.min(
        BURST,
        bucket.tokens + (now.getTime() - bucket.refilledAt.getTime()) / MILLISECONDS_PER_TOKEN,
      );

const accept = ({
  chatter,
  room,
  message,
  tokens,
  now,
}: {
  chatter: ChatterContext;
  room: RoomState;
  message: ChatMessage;
  tokens: number;
  now: Date;
}): Result<Accepted, Rejection> =>
  ok({
    message: {
      channelId: message.channelId,
      authorId: chatter.userId,
      body: message.body,
      sentAt: now,
      ...(room.sessionId === null ? {} : { sessionId: room.sessionId }),
    },
    bucket: { tokens: tokens - 1, refilledAt: now },
  });

export const decide = ({
  chatter,
  room,
  message,
  bucket,
  now,
}: {
  chatter: ChatterContext;
  room: RoomState;
  message: ChatMessage;
  bucket: TokenBucket | undefined;
  now: Date;
}): Result<Accepted, Rejection> => {
  const sanction = activeSanction({ chatter, channelId: room.channelId, now });
  if (sanction !== undefined) {
    return err(sanction.expiresAt === null ? "banned" : "timed_out");
  }
  const tokens = refill(bucket, now);
  return tokens < 1 ? err("rate_limited") : accept({ chatter, room, message, tokens, now });
};
