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
import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { startPeriodicJob } from "../../platform/periodic-job.ts";
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import type { LiveVideoProviderPort } from "./application/live-video-provider.ts";
import { receiveProviderWebhook } from "./application/receive-provider-webhook.ts";
import { reconcileStreamSessions } from "./application/reconcile-stream-sessions.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import { getStreamKey, provisionStreamChannel } from "./application/stream-keys.ts";
import { fakeLiveVideoProvider } from "./infrastructure/fake-live-video-provider.ts";
import { prismaStreamChannels } from "./infrastructure/prisma-stream-channels.ts";
import {
  prismaOpenStreamSessions,
  prismaStreamSessions,
  type StreamPrisma,
} from "./infrastructure/prisma-stream-sessions.ts";
import { reconciliationEndEventId } from "./infrastructure/reconciliation-end-event-id.ts";
import { channelEventHandlers } from "./presentation/channel-event-handlers.ts";
import { GET_STREAM_KEY, StreamKeyController } from "./presentation/stream-key.controller.ts";
import {
  RECEIVE_PROVIDER_WEBHOOK,
  VideoWebhookController,
} from "./presentation/video-webhook.controller.ts";

export type { StreamPrisma } from "./infrastructure/prisma-stream-sessions.ts";

export const RECONCILIATION_INTERVAL_MS = 60_000;

const STREAM_DEPENDENCIES = Symbol("STREAM_DEPENDENCIES");

const CHANNEL_STREAM = "events.channel";
const GROUP = "stream";
const CLAIM_IDLE_MS = 30_000;
const BLOCK_MS = 1000;

type StreamDependencies = {
  prisma: StreamPrisma;
  webhookSecret: string;
  authzRedis: AuthzRedis;
  consumerRedis: StreamConsumerRedis;
  logSink: LogSink;
  reconciliationIntervalMs?: number;
};

type ModuleState = StreamDependencies & {
  readonly provider: LiveVideoProviderPort;
  readonly reconcile: (now: Date) => Promise<{ readonly closed: readonly string[] }>;
};

@Module({})
export class StreamModule implements OnModuleInit, OnModuleDestroy {
  #consumer: { stop: () => Promise<void> } | undefined;
  #reconciliation: { stop: () => Promise<void> } | undefined;

  constructor(@Inject(STREAM_DEPENDENCIES) private readonly dependencies: ModuleState) {}

  static register(dependencies: StreamDependencies): DynamicModule {
    const { prisma, webhookSecret, authzRedis } = dependencies;
    const provider = fakeLiveVideoProvider({ webhookSecret });
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
    return {
      module: StreamModule,
      controllers: [VideoWebhookController, StreamKeyController],
      providers: [
        {
          provide: STREAM_DEPENDENCIES,
          useValue: { ...dependencies, provider, reconcile } satisfies ModuleState,
        },
        {
          provide: RECEIVE_PROVIDER_WEBHOOK,
          useValue: receiveProviderWebhook({ provider, record, now: () => new Date() }),
        },
        {
          provide: GET_STREAM_KEY,
          useValue: getStreamKey({
            channels: prismaStreamChannels(prisma),
            provider,
            authz: createAuthzContext({ prisma, redis: authzRedis, now: () => new Date() }),
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
      reconciliationIntervalMs = RECONCILIATION_INTERVAL_MS,
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
  }

  async onModuleDestroy(): Promise<void> {
    const { prisma, consumerRedis } = this.dependencies;
    await this.#reconciliation?.stop();
    await this.#consumer?.stop();
    await prisma.$disconnect();
    if (consumerRedis.isOpen) {
      consumerRedis.destroy();
    }
  }
}
