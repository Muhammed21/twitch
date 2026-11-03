import type { z } from "zod";

import { events } from "@repo/contracts";

import type { LocalViewWriter, SanctionedSockets, SanctionMetrics } from "./ports.ts";
import type { RoomRegistry } from "./room-registry.ts";

export type ChatEvent = {
  readonly name: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: unknown;
};

export type ChatEventHandler = (event: ChatEvent) => Promise<void>;

type ChatLog = (entry: Readonly<Record<string, unknown>>) => void;

type EventContract<T> = {
  readonly name: string;
  readonly version: number;
  readonly payload: z.ZodType<T>;
};

const { channelCreated } = events.channel;
const { streamStarted, streamEnded } = events.stream;
const { accountRegistered } = events.identity;
const { userTimedOut } = events.moderation;

const handlerFor =
  (log: ChatLog) =>
  <T>(
    contract: EventContract<T>,
    apply: (payload: T, occurredAt: Date) => Promise<void> | void,
  ): ChatEventHandler =>
  async ({ name, version, occurredAt, payload }) => {
    if (version !== contract.version) {
      throw new Error(`${name} version ${version} non gérée`);
    }
    const parsed = contract.payload.safeParse(payload);
    if (!parsed.success) {
      log({ level: "error", msg: "event écarté : payload hors contrat", event: name });
      return;
    }
    await apply(parsed.data, occurredAt);
  };

const sanctionOf = ({
  userId,
  channelId,
  expiresAt,
}: {
  userId: string;
  channelId: string;
  expiresAt: string;
}) => ({ userId, channelId, expiresAt: new Date(expiresAt) });

export const chatEventHandlers = ({
  views,
  rooms,
  log,
}: {
  views: LocalViewWriter;
  rooms: Pick<RoomRegistry, "refresh">;
  log: ChatLog;
}): Readonly<Record<string, ChatEventHandler>> => {
  const handle = handlerFor(log);
  return {
    [channelCreated.name]: handle(channelCreated, ({ channelId }) => views.openRoom(channelId)),
    [streamStarted.name]: handle(streamStarted, async ({ channelId, sessionId }) => {
      rooms.refresh(await views.startSession({ channelId, sessionId }));
    }),
    [streamEnded.name]: handle(streamEnded, async ({ channelId, sessionId }) => {
      rooms.refresh(await views.endSession({ channelId, sessionId }));
    }),
    [accountRegistered.name]: handle(accountRegistered, ({ accountId, displayName }) =>
      views.registerChatter({ userId: accountId, displayName }),
    ),
    [userTimedOut.name]: handle(userTimedOut, (payload) =>
      views.sanctionChatter(sanctionOf(payload)),
    ),
  };
};

export const socketSanctionHandlers = ({
  sockets,
  metrics,
  log,
}: {
  sockets: SanctionedSockets;
  metrics: SanctionMetrics;
  log: ChatLog;
}): Readonly<Record<string, ChatEventHandler>> => ({
  [userTimedOut.name]: handlerFor(log)(userTimedOut, (payload, occurredAt) => {
    sockets.sanction(sanctionOf(payload));
    metrics.sanctionApplied(occurredAt);
  }),
});
