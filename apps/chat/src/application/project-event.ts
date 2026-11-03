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

export const chatEventHandlers = ({
  views,
  rooms,
  sockets,
  metrics,
  log,
}: {
  views: LocalViewWriter;
  rooms: Pick<RoomRegistry, "refresh">;
  sockets: SanctionedSockets;
  metrics: SanctionMetrics;
  log: ChatLog;
}): Readonly<Record<string, ChatEventHandler>> => {
  const handle =
    <T>(
      contract: EventContract<T>,
      apply: (payload: T, occurredAt: Date) => Promise<void>,
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
    [userTimedOut.name]: handle(
      userTimedOut,
      async ({ userId, channelId, expiresAt }, occurredAt) => {
        const sanction = { userId, channelId, expiresAt: new Date(expiresAt) };
        await views.sanctionChatter(sanction);
        sockets.sanction(sanction);
        metrics.sanctionApplied(occurredAt);
      },
    ),
  };
};
