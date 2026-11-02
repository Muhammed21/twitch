import { hostname } from "node:os";

import {
  type DynamicModule,
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type { Pool } from "pg";

import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { projectDiscoveryEvent } from "./application/project-discovery-event.ts";
import {
  type RebuildReport,
  rebuildLiveChannelViews,
} from "./application/rebuild-live-channel-views.ts";
import { pgOutboxHistory } from "./infrastructure/pg-outbox-history.ts";
import {
  type DiscoveryPrisma,
  prismaLiveChannelProjection,
  prismaLiveChannelStore,
} from "./infrastructure/prisma-live-channel-projection.ts";
import { discoveryEventHandlers } from "./presentation/discovery-event-handlers.ts";

export type { DiscoveryPrisma };

const REBUILD_PAGE_SIZE = 500;

export const rebuildDiscoveryProjection = ({
  pool,
  prisma,
}: {
  pool: Pool;
  prisma: DiscoveryPrisma;
}): Promise<RebuildReport> =>
  rebuildLiveChannelViews({
    history: pgOutboxHistory(pool),
    store: prismaLiveChannelStore(prisma),
    pageSize: REBUILD_PAGE_SIZE,
  });

const DISCOVERY_DEPENDENCIES = Symbol("DISCOVERY_DEPENDENCIES");
const GROUP = "discovery";
const CLAIM_IDLE_MS = 30_000;
const BLOCK_MS = 1000;

type DiscoveryDependencies = {
  prisma: DiscoveryPrisma;
  channelConsumerRedis: StreamConsumerRedis;
  streamConsumerRedis: StreamConsumerRedis;
  logSink: LogSink;
};

@Module({})
export class DiscoveryModule implements OnModuleInit, OnModuleDestroy {
  #consumers: readonly { stop: () => Promise<void> }[] = [];

  constructor(
    @Inject(DISCOVERY_DEPENDENCIES) private readonly dependencies: DiscoveryDependencies,
  ) {}

  static register(dependencies: DiscoveryDependencies): DynamicModule {
    return {
      module: DiscoveryModule,
      providers: [{ provide: DISCOVERY_DEPENDENCIES, useValue: dependencies }],
    };
  }

  onModuleInit(): void {
    const { prisma, channelConsumerRedis, streamConsumerRedis, logSink } = this.dependencies;
    const handlers = discoveryEventHandlers({
      project: projectDiscoveryEvent(prismaLiveChannelProjection(prisma)),
      logSink,
    });
    this.#consumers = [
      { redis: channelConsumerRedis, stream: "events.channel" },
      { redis: streamConsumerRedis, stream: "events.stream" },
    ].map(({ redis, stream }) =>
      startStreamConsumer({
        redis,
        stream,
        group: GROUP,
        consumer: `${hostname()}-${process.pid}`,
        handlers,
        claimIdleMs: CLAIM_IDLE_MS,
        blockMs: BLOCK_MS,
        onError: ({ stream: failedStream, entryId, error }) =>
          writeLog(logSink, {
            level: "error",
            msg: "consommation de stream en échec",
            stream: failedStream,
            entryId,
            ...errorDetails(error),
          }),
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    const { prisma, channelConsumerRedis, streamConsumerRedis } = this.dependencies;
    await Promise.all(this.#consumers.map((consumer) => consumer.stop()));
    await prisma.$disconnect();
    [channelConsumerRedis, streamConsumerRedis]
      .filter((redis) => redis.isOpen)
      .forEach((redis) => redis.destroy());
  }
}
