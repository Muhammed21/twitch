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
const { accountRegistered, avatarChanged, chatColorChanged } = events.identity;
const { userBanned, userTimedOut } = events.moderation;
const { entitlementGranted, entitlementRevoked } = events.monetization;

const PLATFORM = "platform";

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
  expiresAt: string | null;
}) => ({ userId, channelId, expiresAt: expiresAt === null ? null : new Date(expiresAt) });

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
    [avatarChanged.name]: handle(avatarChanged, ({ accountId, avatarKey }, occurredAt) =>
      views.changeAvatar({ userId: accountId, avatarKey, changedAt: occurredAt }),
    ),
    [chatColorChanged.name]: handle(chatColorChanged, ({ accountId, chatColor }, occurredAt) =>
      views.changeChatColor({ userId: accountId, chatColor, changedAt: occurredAt }),
    ),
    [userTimedOut.name]: handle(userTimedOut, (payload) =>
      views.sanctionChatter(sanctionOf(payload)),
    ),
    [userBanned.name]: handle(userBanned, (payload) => views.sanctionChatter(sanctionOf(payload))),
    [entitlementGranted.name]: handle(
      entitlementGranted,
      async ({ userId, scope, expiresAt }, occurredAt) => {
        if (scope === PLATFORM) {
          await views.changeTurbo({
            userId,
            expiresAt: new Date(expiresAt),
            changedAt: occurredAt,
          });
        }
      },
    ),
    [entitlementRevoked.name]: handle(entitlementRevoked, async ({ userId, scope }, occurredAt) => {
      if (scope === PLATFORM) {
        await views.changeTurbo({ userId, expiresAt: null, changedAt: occurredAt });
      }
    }),
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
  [userBanned.name]: handlerFor(log)(userBanned, (payload, occurredAt) => {
    sockets.ban(sanctionOf(payload));
    metrics.sanctionApplied(occurredAt);
  }),
});
