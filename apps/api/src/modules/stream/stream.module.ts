import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { type AuthzRedis, createAuthzContext } from "../../authz/authz-context.ts";
import type { VideoProviderConfig } from "../../platform/config/env.ts";
import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { startPeriodicJob } from "../../platform/periodic-job.ts";
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import type { LiveVideoProviderPort } from "./application/live-video-provider.ts";
import { receiveProviderWebhook } from "./application/receive-provider-webhook.ts";
import { reconcileStreamSessions } from "./application/reconcile-stream-sessions.ts";
import { recordPresence } from "./application/record-presence.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import { nextSampleDelayMs, sampleViewerCounts } from "./application/sample-viewer-counts.ts";
import {
  getStreamKey,
  provisionStreamChannel,
  rotateStreamKey,
} from "./application/stream-keys.ts";
import { fakeLiveVideoProvider } from "./infrastructure/fake-live-video-provider.ts";
import { prismaStreamChannels } from "./infrastructure/prisma-stream-channels.ts";
import {
  prismaOpenStreamSessions,
  prismaStreamSessions,
  type StreamPrisma,
} from "./infrastructure/prisma-stream-sessions.ts";
import {
  prismaOpenSessionPages,
  prismaViewerCountSamples,
} from "./infrastructure/prisma-viewer-count-samples.ts";
import { reconciliationEndEventId } from "./infrastructure/reconciliation-end-event-id.ts";
import { type PresenceRedis, redisPresenceStore } from "./infrastructure/redis-presence-store.ts";
import { videoServiceProvider } from "./infrastructure/video-service-provider.ts";
import { channelEventHandlers } from "./presentation/channel-event-handlers.ts";
import { PresenceController, RECORD_PRESENCE } from "./presentation/presence.controller.ts";
import {
  GET_STREAM_KEY,
  ROTATE_STREAM_KEY,
  StreamKeyController,
} from "./presentation/stream-key.controller.ts";
import {
  RECEIVE_PROVIDER_WEBHOOK,
  VideoWebhookController,
} from "./presentation/video-webhook.controller.ts";

export type { StreamPrisma } from "./infrastructure/prisma-stream-sessions.ts";
export { createPresenceRedis, type PresenceRedis } from "./infrastructure/redis-presence-store.ts";

export const createViewerCountReader =
  (presenceRedis: PresenceRedis) =>
  (channelIds: readonly string[]): Promise<ReadonlyMap<string, number>> =>
    redisPresenceStore(presenceRedis).count({ channelIds, at: new Date() });

export const RECONCILIATION_INTERVAL_MS = 60_000;
export const viewerCountSampleDelayMs = (): number => nextSampleDelayMs(new Date());

const STREAM_DEPENDENCIES = Symbol("STREAM_DEPENDENCIES");

const CHANNEL_STREAM = "events.channel";
const GROUP = "stream";
const CLAIM_IDLE_MS = 30_000;
const BLOCK_MS = 1000;

type StreamDependencies = {
  prisma: StreamPrisma;
  webhookSecret: string;
  video: VideoProviderConfig;
  authzRedis: AuthzRedis;
  consumerRedis: StreamConsumerRedis;
  presenceRedis: PresenceRedis;
  logSink: LogSink;
  reconciliationIntervalMs?: number;
  viewerCountSampleIntervalMs?: number | (() => number);
};

type ModuleState = StreamDependencies & {
  readonly provider: LiveVideoProviderPort;
  readonly reconcile: (now: Date) => Promise<{ readonly closed: readonly string[] }>;
  readonly sample: (now: Date) => Promise<void>;
};

@Module({})
export class StreamModule implements OnModuleInit, OnModuleDestroy {
  #consumer: { stop: () => Promise<void> } | undefined;
  #reconciliation: { stop: () => Promise<void> } | undefined;
  #sampling: { stop: () => Promise<void> } | undefined;

  constructor(@Inject(STREAM_DEPENDENCIES) private readonly dependencies: ModuleState) {}

  static register(dependencies: StreamDependencies): DynamicModule {
    const { prisma, webhookSecret, video, authzRedis, presenceRedis } = dependencies;
    const provider =
      video.provider === "fake"
        ? fakeLiveVideoProvider({ webhookSecret })
        : videoServiceProvider({
            baseUrl: video.serviceUrl,
            serviceSecret: video.serviceSecret,
            webhookSecret,
          });
    const record = recordStreamLifecycle({
      sessions: prismaStreamSessions(prisma),
      newId: randomUUID,
    });
    const reconcile = reconcileStreamSessions({
      provider,
      openSessions: prismaOpenStreamSessions({ prisma }),
      record,
      endEventIdOf: reconciliationEndEventId,
    });
    const sample = sampleViewerCounts({
      sessions: prismaOpenSessionPages({ prisma }),
      presence: redisPresenceStore(presenceRedis),
      samples: prismaViewerCountSamples(prisma),
    });
    const streamKeyDependencies = {
      channels: prismaStreamChannels(prisma),
      provider,
      authz: createAuthzContext({ prisma, redis: authzRedis, now: () => new Date() }),
    };
    return {
      module: StreamModule,
      controllers: [VideoWebhookController, StreamKeyController, PresenceController],
      providers: [
        {
          provide: STREAM_DEPENDENCIES,
          useValue: { ...dependencies, provider, reconcile, sample } satisfies ModuleState,
        },
        {
          provide: RECEIVE_PROVIDER_WEBHOOK,
          useValue: receiveProviderWebhook({ provider, record, now: () => new Date() }),
        },
        {
          provide: GET_STREAM_KEY,
          useValue: getStreamKey(streamKeyDependencies),
        },
        {
          provide: ROTATE_STREAM_KEY,
          useValue: rotateStreamKey(streamKeyDependencies),
        },
        {
          provide: RECORD_PRESENCE,
          useValue: recordPresence({
            store: redisPresenceStore(presenceRedis),
            now: () => new Date(),
          }),
        },
      ],
    };
  }

  onModuleInit(): void {
    const {
      prisma,
      provider,
      consumerRedis,
      logSink,
      reconcile,
      sample,
      reconciliationIntervalMs = RECONCILIATION_INTERVAL_MS,
      viewerCountSampleIntervalMs = viewerCountSampleDelayMs,
    } = this.dependencies;
    this.#consumer = startStreamConsumer({
      redis: consumerRedis,
      stream: CHANNEL_STREAM,
      group: GROUP,
      consumer: `${hostname()}-${process.pid}`,
      handlers: channelEventHandlers({
        provision: provisionStreamChannel({
          provider,
          channels: prismaStreamChannels(prisma),
        }),
        logSink,
      }),
      claimIdleMs: CLAIM_IDLE_MS,
      blockMs: BLOCK_MS,
      onError: ({ stream, entryId, error }) =>
        writeLog(logSink, {
          level: "error",
          msg: "consommation de stream en échec",
          stream,
          entryId,
          ...errorDetails(error),
        }),
    });
    this.#reconciliation = startPeriodicJob({
      intervalMs: reconciliationIntervalMs,
      run: async () => {
        const { closed } = await reconcile(new Date());
        if (closed.length > 0) {
          writeLog(logSink, {
            level: "info",
            msg: "sessions closes par la réconciliation",
            closed,
          });
        }
      },
      onError: (error) =>
        writeLog(logSink, {
          level: "error",
          msg: "réconciliation en échec",
          ...errorDetails(error),
        }),
    });
    this.#sampling = startPeriodicJob({
      intervalMs: viewerCountSampleIntervalMs,
      run: () => sample(new Date()),
      onError: (error) =>
        writeLog(logSink, {
          level: "error",
          msg: "échantillonnage du compteur de viewers en échec",
          ...errorDetails(error),
        }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    const { prisma, consumerRedis, presenceRedis } = this.dependencies;
    await this.#sampling?.stop();
    await this.#reconciliation?.stop();
    await this.#consumer?.stop();
    await prisma.$disconnect();
    if (consumerRedis.isOpen) {
      consumerRedis.destroy();
    }
    if (presenceRedis.isOpen) {
      presenceRedis.destroy();
    }
  }
}
