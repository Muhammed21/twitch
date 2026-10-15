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
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import type { LiveVideoProviderPort } from "./application/live-video-provider.ts";
import { receiveProviderWebhook } from "./application/receive-provider-webhook.ts";
import { recordStreamLifecycle } from "./application/record-stream-lifecycle.ts";
import { getStreamKey, provisionStreamChannel } from "./application/stream-keys.ts";
import { fakeLiveVideoProvider } from "./infrastructure/fake-live-video-provider.ts";
import { prismaStreamChannels } from "./infrastructure/prisma-stream-channels.ts";
import {
  prismaStreamSessions,
  type StreamPrisma,
} from "./infrastructure/prisma-stream-sessions.ts";
import { channelEventHandlers } from "./presentation/channel-event-handlers.ts";
import { GET_STREAM_KEY, StreamKeyController } from "./presentation/stream-key.controller.ts";
import {
  RECEIVE_PROVIDER_WEBHOOK,
  VideoWebhookController,
} from "./presentation/video-webhook.controller.ts";

export type { StreamPrisma } from "./infrastructure/prisma-stream-sessions.ts";

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
};

type ModuleState = StreamDependencies & { readonly provider: LiveVideoProviderPort };

@Module({})
export class StreamModule implements OnModuleInit, OnModuleDestroy {
  #consumer: { stop: () => Promise<void> } | undefined;

  constructor(@Inject(STREAM_DEPENDENCIES) private readonly dependencies: ModuleState) {}

  static register(dependencies: StreamDependencies): DynamicModule {
    const { prisma, webhookSecret, authzRedis } = dependencies;
    const provider = fakeLiveVideoProvider({ webhookSecret });
    return {
      module: StreamModule,
      controllers: [VideoWebhookController, StreamKeyController],
      providers: [
        {
          provide: STREAM_DEPENDENCIES,
          useValue: { ...dependencies, provider } satisfies ModuleState,
        },
        {
          provide: RECEIVE_PROVIDER_WEBHOOK,
          useValue: receiveProviderWebhook({
            provider,
            record: recordStreamLifecycle({
              sessions: prismaStreamSessions(prisma),
              newId: randomUUID,
            }),
            now: () => new Date(),
          }),
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
    const { prisma, provider, consumerRedis, logSink } = this.dependencies;
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
  }

  async onModuleDestroy(): Promise<void> {
    const { prisma, consumerRedis } = this.dependencies;
    await this.#consumer?.stop();
    await prisma.$disconnect();
    if (consumerRedis.isOpen) {
      consumerRedis.destroy();
    }
  }
}
