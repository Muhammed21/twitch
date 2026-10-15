import type { z } from "zod";

import { events } from "@repo/contracts";
import {
  alreadyProcessed,
  appendToOutbox,
  collectByKeyset,
  type createContextClient,
  type KeysetPage,
} from "@repo/db";

import type { OpenStreamSessions } from "../application/reconcile-stream-sessions.ts";
import type {
  LifecycleTransaction,
  StreamLifecyclePublication,
  StreamSessions,
} from "../application/record-stream-lifecycle.ts";

export type StreamPrisma = ReturnType<typeof createContextClient>;

type StreamTransaction = Parameters<Parameters<StreamPrisma["$transaction"]>[0]>[0];

const HANDLER = "stream.record-lifecycle";
const OUTBOX = { schema: "stream", table: "StreamOutbox" };
const PROCESSED_EVENTS = { schema: "stream", table: "StreamProcessedEvent" };
const SESSION = { id: true, providerSessionId: true, startedAt: true, endedAt: true } as const;

const { streamStarted, streamEnded } = events.stream;

const toOutboxEvent = ({
  outboxEventId,
  kind,
  sessionId,
  channelId,
  at,
}: StreamLifecyclePublication) => {
  const base = { id: outboxEventId, occurredAt: at };
  if (kind === "started") {
    const payload = {
      sessionId,
      channelId,
      startedAt: at.toISOString(),
    } satisfies z.input<typeof streamStarted.payload>;
    return { ...base, name: streamStarted.name, version: streamStarted.version, payload };
  }
  const payload = {
    sessionId,
    channelId,
    endedAt: at.toISOString(),
  } satisfies z.input<typeof streamEnded.payload>;
  return { ...base, name: streamEnded.name, version: streamEnded.version, payload };
};

const lifecycleTransaction = (tx: StreamTransaction): LifecycleTransaction => ({
  alreadyProcessed: (eventId) =>
    alreadyProcessed(tx, { processedEvents: PROCESSED_EVENTS, eventId, handler: HANDLER }),
  channelOf: async (providerChannelId) =>
    (await tx.streamChannel.findUnique({ where: { providerChannelId } }))?.channelId ?? null,
  openSessionOf: (channelId) =>
    tx.streamSession.findFirst({ where: { channelId, endedAt: null }, select: SESSION }),
  sessionByProvider: (providerSessionId) =>
    tx.streamSession.findUnique({ where: { providerSessionId }, select: SESSION }),
  followingSessionOf: (channelId, after) =>
    tx.streamSession.findFirst({
      where: { channelId, startedAt: { gt: after } },
      orderBy: { startedAt: "asc" },
      select: SESSION,
    }),
  closeSession: async ({ sessionId, endedAt }) => {
    await tx.streamSession.update({ where: { id: sessionId }, data: { endedAt } });
  },
  openSession: async (session) => {
    await tx.streamSession.create({ data: session });
  },
  archiveSession: async (session) => {
    await tx.streamSession.create({ data: session });
  },
  publish: (publication) =>
    appendToOutbox(tx, { outbox: OUTBOX, event: toOutboxEvent(publication) }),
});

export const prismaStreamSessions = (prisma: StreamPrisma): StreamSessions => ({
  transaction: (work) => prisma.$transaction((tx) => work(lifecycleTransaction(tx))),
});

const OPEN_SESSIONS_PAGE_SIZE = 100;

const openSessionsPage = async (prisma: StreamPrisma, { take, after }: KeysetPage) => {
  const sessions = await prisma.streamSession.findMany({
    where: { endedAt: null, id: { gt: after } },
    orderBy: { id: "asc" },
    take,
    select: { id: true, channelId: true, providerSessionId: true, startedAt: true },
  });
  const channels = await prisma.streamChannel.findMany({
    where: { channelId: { in: sessions.map(({ channelId }) => channelId) } },
    take: sessions.length,
    select: { channelId: true, providerChannelId: true },
  });
  const providerChannelOf = new Map(
    channels.map(({ channelId, providerChannelId }) => [channelId, providerChannelId]),
  );
  return sessions.map(({ id, channelId, providerSessionId, startedAt }) => ({
    id,
    providerSessionId,
    providerChannelId: providerChannelOf.get(channelId),
    startedAt,
  }));
};

export const prismaOpenStreamSessions = ({
  prisma,
  pageSize = OPEN_SESSIONS_PAGE_SIZE,
}: {
  prisma: StreamPrisma;
  pageSize?: number;
}): OpenStreamSessions => ({
  list: async () =>
    (
      await collectByKeyset({
        pageSize,
        fetchPage: (page) => openSessionsPage(prisma, page),
        keyOf: ({ id }) => id,
      })
    ).flatMap(({ providerSessionId, providerChannelId, startedAt }) =>
      providerChannelId === undefined ? [] : [{ providerSessionId, providerChannelId, startedAt }],
    ),
});
