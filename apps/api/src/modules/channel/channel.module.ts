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
import { getChannel, updateChannelTitle } from "./application/channel-queries.ts";
import { createChannelForAccount } from "./application/create-channel-for-account.ts";
import { prismaChannelDirectory } from "./infrastructure/prisma-channel-directory.ts";
import {
  type ChannelPrisma,
  prismaChannelRegistry,
} from "./infrastructure/prisma-channel-registry.ts";
import { redisOwnerAssignmentsCache } from "./infrastructure/redis-owner-assignments-cache.ts";
import {
  ChannelsController,
  GET_CHANNEL,
  UPDATE_CHANNEL_TITLE,
} from "./presentation/channels.controller.ts";
import { identityEventHandlers } from "./presentation/identity-event-handlers.ts";

export type { ChannelPrisma } from "./infrastructure/prisma-channel-registry.ts";

const CHANNEL_DEPENDENCIES = Symbol("CHANNEL_DEPENDENCIES");

const IDENTITY_STREAM = "events.identity";
const GROUP = "channel";
const CLAIM_IDLE_MS = 30_000;
const BLOCK_MS = 1000;

type ChannelDependencies = {
  prisma: ChannelPrisma;
  authzRedis: AuthzRedis;
  consumerRedis: StreamConsumerRedis;
  logSink: LogSink;
};

@Module({})
export class ChannelModule implements OnModuleInit, OnModuleDestroy {
  #consumer: { stop: () => Promise<void> } | undefined;

  constructor(@Inject(CHANNEL_DEPENDENCIES) private readonly dependencies: ChannelDependencies) {}

  static register(dependencies: ChannelDependencies): DynamicModule {
    const directory = prismaChannelDirectory(dependencies.prisma);
    return {
      module: ChannelModule,
      controllers: [ChannelsController],
      providers: [
        { provide: CHANNEL_DEPENDENCIES, useValue: dependencies },
        { provide: GET_CHANNEL, useValue: getChannel(directory) },
        {
          provide: UPDATE_CHANNEL_TITLE,
          useValue: updateChannelTitle({
            directory,
            authz: createAuthzContext({
              prisma: dependencies.prisma,
              redis: dependencies.authzRedis,
              now: () => new Date(),
            }),
            newId: randomUUID,
            now: () => new Date(),
          }),
        },
      ],
    };
  }

  onModuleInit(): void {
    const { prisma, authzRedis, consumerRedis, logSink } = this.dependencies;
    this.#consumer = startStreamConsumer({
      redis: consumerRedis,
      stream: IDENTITY_STREAM,
      group: GROUP,
      consumer: `${hostname()}-${process.pid}`,
      handlers: identityEventHandlers({
        createChannel: createChannelForAccount({
          registry: prismaChannelRegistry(prisma),
          cache: redisOwnerAssignmentsCache(authzRedis),
          newId: randomUUID,
          now: () => new Date(),
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
    const { prisma, authzRedis, consumerRedis } = this.dependencies;
    await this.#consumer?.stop();
    await prisma.$disconnect();
    [authzRedis, consumerRedis].filter((redis) => redis.isOpen).forEach((redis) => redis.destroy());
  }
}
