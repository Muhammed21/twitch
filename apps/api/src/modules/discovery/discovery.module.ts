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
import { startPeriodicJob } from "../../platform/periodic-job.ts";
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import { listCategoryLives } from "./application/category-reads.ts";
import {
  type ListLives,
  listLives,
  type ThumbnailUrlReader,
  withLiveThumbnails,
  withLiveViewerCounts,
} from "./application/list-lives.ts";
import { withLiveCategories } from "./application/live-categories.ts";
import { createLiveStatusHub, type LiveStatusHub } from "./application/live-status-hub.ts";
import { type ViewerCountReader, withViewerCounts } from "./application/live-status-viewers.ts";
import { projectDiscoveryEvent } from "./application/project-discovery-event.ts";
import {
  type RebuildReport,
  rebuildLiveChannelViews,
} from "./application/rebuild-live-channel-views.ts";
import { pgOutboxHistory } from "./infrastructure/pg-outbox-history.ts";
import {
  type DiscoveryPrisma,
  prismaCategoryProjection,
  prismaLiveChannelProjection,
  prismaLiveChannelStore,
} from "./infrastructure/prisma-live-channel-projection.ts";
import { prismaCategoryViewReader, prismaLiveReader } from "./infrastructure/prisma-live-reader.ts";
import { prismaLiveStatusReader } from "./infrastructure/prisma-live-status-reader.ts";
import { CategoriesController, LIST_CATEGORY_LIVES } from "./presentation/categories.controller.ts";
import { discoveryEventHandlers } from "./presentation/discovery-event-handlers.ts";
import {
  LIVE_STATUS_HEARTBEAT_MS,
  LIVE_STATUS_HUB,
  LiveStatusController,
} from "./presentation/live-status.controller.ts";
import { LIST_LIVES, LivesController } from "./presentation/lives.controller.ts";

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
const LIVE_STATUS_TICK_MS = 1000;
const LIVE_STATUS_HEARTBEAT_INTERVAL_MS = 15_000;

type DiscoveryDependencies = {
  prisma: DiscoveryPrisma;
  channelConsumerRedis: StreamConsumerRedis;
  streamConsumerRedis: StreamConsumerRedis;
  viewerCounts: ViewerCountReader;
  thumbnailUrls: ThumbnailUrlReader;
  logSink: LogSink;
};

const listedLives = ({
  prisma,
  viewerCounts,
  thumbnailUrls,
  logSink,
}: DiscoveryDependencies): ListLives =>
  withLiveCategories({
    lives: withLiveViewerCounts({
      lives: withLiveThumbnails({
        lives: listLives(prismaLiveReader(prisma)),
        thumbnailUrls,
        onThumbnailFailure: (error) =>
          writeLog(logSink, {
            level: "error",
            msg: "lecture des vignettes de la liste des lives en échec",
            ...errorDetails(error),
          }),
      }),
      viewerCounts,
      onViewerCountFailure: (error) =>
        writeLog(logSink, {
          level: "error",
          msg: "lecture du nombre de viewers de la liste des lives en échec",
          ...errorDetails(error),
        }),
    }),
    categories: prismaCategoryViewReader(prisma),
  });

@Module({})
export class DiscoveryModule implements OnModuleInit, OnModuleDestroy {
  #consumers: readonly { stop: () => Promise<void> }[] = [];

  constructor(
    @Inject(DISCOVERY_DEPENDENCIES) private readonly dependencies: DiscoveryDependencies,
    @Inject(LIVE_STATUS_HUB) private readonly liveStatusHub: LiveStatusHub,
  ) {}

  static register(dependencies: DiscoveryDependencies): DynamicModule {
    return {
      module: DiscoveryModule,
      controllers: [LivesController, LiveStatusController, CategoriesController],
      providers: [
        { provide: DISCOVERY_DEPENDENCIES, useValue: dependencies },
        {
          provide: LIVE_STATUS_HUB,
          useValue: createLiveStatusHub(
            withViewerCounts({
              statuses: prismaLiveStatusReader(dependencies.prisma),
              viewerCounts: dependencies.viewerCounts,
              onViewerCountFailure: (error) =>
                writeLog(dependencies.logSink, {
                  level: "error",
                  msg: "lecture du nombre de viewers en échec",
                  ...errorDetails(error),
                }),
            }),
          ),
        },
        { provide: LIVE_STATUS_HEARTBEAT_MS, useValue: LIVE_STATUS_HEARTBEAT_INTERVAL_MS },
        { provide: LIST_LIVES, useValue: listedLives(dependencies) },
        {
          provide: LIST_CATEGORY_LIVES,
          useValue: listCategoryLives({
            categories: prismaCategoryViewReader(dependencies.prisma),
            lives: listedLives(dependencies),
          }),
        },
      ],
    };
  }

  onModuleInit(): void {
    const { prisma, channelConsumerRedis, streamConsumerRedis, logSink } = this.dependencies;
    const handlers = discoveryEventHandlers({
      project: projectDiscoveryEvent({
        channels: prismaLiveChannelProjection(prisma),
        categories: prismaCategoryProjection(prisma),
      }),
      logSink,
    });
    const liveStatusTicks = startPeriodicJob({
      intervalMs: LIVE_STATUS_TICK_MS,
      run: () => this.liveStatusHub.tick(),
      onError: (error) =>
        writeLog(logSink, {
          level: "error",
          msg: "tick du statut des lives en échec",
          ...errorDetails(error),
        }),
    });
    this.#consumers = [
      liveStatusTicks,
      ...[
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
      ),
    ];
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
