import { z } from "zod";

import {
  appendToOutbox,
  collectByKeyset,
  type createContextClient,
  type KeysetPage,
  type TableRef,
} from "@repo/db";

import type { VideoStore } from "../control-plane/control-plane.ts";
import type { IngestSession, LifecycleEvent, VideoChannel } from "../domain/ingest.ts";
import type { StreamKeyCipher } from "./stream-key-cipher.ts";

export type VideoPrisma = ReturnType<typeof createContextClient>;

type LiveSession = Extract<IngestSession, { state: "live" }>;

const LIVE_SESSIONS_PAGE_SIZE = 100;

const EVENT_VERSION = 1;

export const VIDEO_OUTBOX: TableRef = { schema: "video", table: "VideoOutbox" };

const outboxEventOf = (event: LifecycleEvent) => ({
  id: event.id,
  name: event.type,
  version: EVENT_VERSION,
  payload: event,
  occurredAt: new Date(event.occurredAt),
});

const ChannelId = z.uuid();

const CHANNEL_WITH_KEY = { channel: { select: { id: true, externalId: true } } } as const;

const sessionTimes = (session: IngestSession) => ({
  startedAt: session.state === "idle" ? null : session.startedAt,
  endedAt: session.state === "ended" ? session.endedAt : null,
});

export const prismaVideoStore = ({
  prisma,
  cipher,
  liveSessionsPageSize = LIVE_SESSIONS_PAGE_SIZE,
}: {
  prisma: VideoPrisma;
  cipher: StreamKeyCipher;
  liveSessionsPageSize?: number;
}): VideoStore => {
  const findChannelWhere = async (
    where:
      | { channel: { id: string } | { externalId: string } }
      | { fingerprint: Uint8Array<ArrayBuffer> },
  ): Promise<VideoChannel | undefined> => {
    const stored = await prisma.videoStreamKey.findFirst({
      where,
      include: CHANNEL_WITH_KEY,
    });
    return stored === null ? undefined : { ...stored.channel, streamKey: cipher.decrypt(stored) };
  };

  const liveSessionsPage = async ({ take, after }: KeysetPage): Promise<readonly LiveSession[]> =>
    (
      await prisma.videoIngestSession.findMany({
        where: { state: "live", id: { gt: after } },
        orderBy: { id: "asc" },
        take,
        select: { id: true, channelId: true, startedAt: true },
      })
    ).flatMap(({ id, channelId, startedAt }) =>
      startedAt === null ? [] : [{ state: "live" as const, id, channelId, startedAt }],
    );

  return {
    findChannel: async (id) =>
      ChannelId.safeParse(id).success ? findChannelWhere({ channel: { id } }) : undefined,
    findChannelByExternalId: (externalId) => findChannelWhere({ channel: { externalId } }),
    findChannelByStreamKey: (streamKey) =>
      findChannelWhere({ fingerprint: cipher.fingerprint(streamKey) }),
    saveChannel: async ({ id, externalId, streamKey }) => {
      const encrypted = cipher.encrypt(streamKey);
      const key = {
        ciphertext: Buffer.from(encrypted.ciphertext),
        iv: Buffer.from(encrypted.iv),
        authTag: Buffer.from(encrypted.authTag),
        encryptionKeyVersion: encrypted.encryptionKeyVersion,
        fingerprint: cipher.fingerprint(streamKey),
      };
      await prisma.$transaction([
        prisma.videoChannel.upsert({
          where: { id },
          create: { id, externalId },
          update: { externalId },
        }),
        prisma.videoStreamKey.upsert({
          where: { channelId: id },
          create: { channelId: id, ...key },
          update: key,
        }),
      ]);
    },
    liveSessions: () =>
      collectByKeyset({
        pageSize: liveSessionsPageSize,
        fetchPage: liveSessionsPage,
        keyOf: ({ id }) => id,
      }),
    saveSession: async (session, events) => {
      const data = { state: session.state, ...sessionTimes(session) };
      await prisma.$transaction(async (tx) => {
        await tx.videoIngestSession.upsert({
          where: { id: session.id },
          create: { id: session.id, channelId: session.channelId, ...data },
          update: data,
        });
        for (const event of events) {
          await appendToOutbox(tx, { outbox: VIDEO_OUTBOX, event: outboxEventOf(event) });
        }
      });
    },
  };
};
