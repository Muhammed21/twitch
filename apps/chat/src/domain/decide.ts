import { activeSanction, type ChatterContext } from "@repo/authorization";

export const RATE_LIMIT = { burst: 5, millisecondsPerToken: 1000 } as const;

export type TokenBucket = { readonly tokens: number; readonly refilledAt: Date };

export type RoomState = { readonly channelId: string; readonly sessionId: string | null };

export type ChatMessage = { readonly body: string };

export type AcceptedMessage = ChatMessage & {
  readonly channelId: string;
  readonly authorId: string;
  readonly sentAt: Date;
  readonly sessionId?: string;
};

export type SanctionRejection = "timed_out" | "banned";

export type Rejection = SanctionRejection | "rate_limited";

const refill = (bucket: TokenBucket | undefined, now: Date): number =>
  bucket === undefined
    ? RATE_LIMIT.burst
    : Math.min(
        RATE_LIMIT.burst,
        bucket.tokens +
          (now.getTime() - bucket.refilledAt.getTime()) / RATE_LIMIT.millisecondsPerToken,
      );

export const isBucketFull = ({ bucket, now }: { bucket: TokenBucket; now: Date }): boolean =>
  refill(bucket, now) >= RATE_LIMIT.burst;

export const takeToken = ({
  bucket,
  now,
}: {
  bucket: TokenBucket | undefined;
  now: Date;
}): TokenBucket | undefined => {
  const tokens = refill(bucket, now);
  return tokens < 1 ? undefined : { tokens: tokens - 1, refilledAt: now };
};

export const sanctionRejection = ({
  chatter,
  channelId,
  now,
}: {
  chatter: ChatterContext;
  channelId: string;
  now: Date;
}): SanctionRejection | undefined => {
  const sanction = activeSanction({ chatter, channelId, now });
  if (sanction === undefined) {
    return undefined;
  }
  return sanction.expiresAt === null ? "banned" : "timed_out";
};

export const acceptMessage = ({
  chatter,
  room,
  message,
  now,
}: {
  chatter: ChatterContext;
  room: RoomState;
  message: ChatMessage;
  now: Date;
}): AcceptedMessage => ({
  channelId: room.channelId,
  authorId: chatter.userId,
  body: message.body,
  sentAt: now,
  ...(room.sessionId === null ? {} : { sessionId: room.sessionId }),
});
