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
import type { ImageBrick } from "../../platform/images/images.module.ts";
import { errorDetails, type LogSink, writeLog } from "../../platform/logging.ts";
import { startStreamConsumer, type StreamConsumerRedis } from "../../platform/stream-consumer.ts";
import {
  changeCategoryImage,
  changeCategoryTags,
  createCategory,
  mergeCategory,
  retireCategory,
} from "./application/category-admin.ts";
import { followCategory, unfollowCategory } from "./application/category-follow.ts";
import { searchCategories } from "./application/category-search.ts";
import { changeBanner } from "./application/change-banner.ts";
import { getChannel, updateChannel } from "./application/channel-queries.ts";
import { createChannelForAccount } from "./application/create-channel-for-account.ts";
import {
  prismaCategoryCatalog,
  prismaCategorySearch,
} from "./infrastructure/prisma-category-catalog.ts";
import { prismaCategoryFollows } from "./infrastructure/prisma-category-follows.ts";
import {
  prismaBannerStore,
  prismaChannelDirectory,
} from "./infrastructure/prisma-channel-directory.ts";
import {
  type ChannelPrisma,
  prismaChannelRegistry,
} from "./infrastructure/prisma-channel-registry.ts";
import { redisOwnerAssignmentsCache } from "./infrastructure/redis-owner-assignments-cache.ts";
import {
  AdminCategoriesController,
  CATEGORY_ADMIN,
  CATEGORY_IMAGE_URL,
  type CategoryAdmin,
} from "./presentation/admin-categories.controller.ts";
import {
  CategoryCatalogController,
  SEARCH_CATEGORIES,
} from "./presentation/category-catalog.controller.ts";
import {
  CHANNEL_IMAGE_URL,
  ChannelsController,
  GET_CHANNEL,
  UPDATE_CHANNEL,
} from "./presentation/channels.controller.ts";
import {
  FOLLOW_CATEGORY,
  FollowedCategoriesController,
  UNFOLLOW_CATEGORY,
} from "./presentation/followed-categories.controller.ts";
import { identityEventHandlers } from "./presentation/identity-event-handlers.ts";
import { CHANGE_BANNER, MeBannerController } from "./presentation/me-banner.controller.ts";

export type { ChannelPrisma } from "./infrastructure/prisma-channel-registry.ts";
export {
  prismaOwnedBannerUrl as createBannerUrlReader,
  prismaOwnedChannel as createOwnedChannelReader,
} from "./infrastructure/prisma-owned-channel.ts";

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
  images: Pick<ImageBrick, "finalizeImage" | "imageUrlOf" | "storage">;
};

@Module({})
export class ChannelModule implements OnModuleInit, OnModuleDestroy {
  #consumer: { stop: () => Promise<void> } | undefined;

  constructor(@Inject(CHANNEL_DEPENDENCIES) private readonly dependencies: ChannelDependencies) {}

  static register(dependencies: ChannelDependencies): DynamicModule {
    const directory = prismaChannelDirectory(dependencies.prisma);
    const authz = createAuthzContext({
      prisma: dependencies.prisma,
      redis: dependencies.authzRedis,
      now: () => new Date(),
    });
    const categories = {
      catalog: prismaCategoryCatalog(dependencies.prisma),
      authz,
      newId: randomUUID,
      now: () => new Date(),
    };
    const categoryAdmin: CategoryAdmin = {
      create: createCategory(categories),
      merge: mergeCategory(categories),
      retire: retireCategory(categories),
      tags: changeCategoryTags(categories),
      image: changeCategoryImage({
        ...categories,
        finalizeImage: dependencies.images.finalizeImage,
        discardImage: (key) => dependencies.images.storage.delete(key),
        onDiscardFailure: ({ imageKey, error }) =>
          writeLog(dependencies.logSink, {
            level: "error",
            msg: "suppression de l'ancienne pochette en échec : objet orphelin",
            imageKey,
            ...errorDetails(error),
          }),
      }),
    };
    const categoryFollows = {
      follows: prismaCategoryFollows(dependencies.prisma),
      newId: randomUUID,
      now: () => new Date(),
    };
    return {
      module: ChannelModule,
      controllers: [
        ChannelsController,
        MeBannerController,
        AdminCategoriesController,
        CategoryCatalogController,
        FollowedCategoriesController,
      ],
      providers: [
        { provide: CHANNEL_DEPENDENCIES, useValue: dependencies },
        { provide: GET_CHANNEL, useValue: getChannel(directory) },
        {
          provide: UPDATE_CHANNEL,
          useValue: updateChannel({
            directory,
            authz,
            newId: randomUUID,
            now: () => new Date(),
          }),
        },
        { provide: CHANNEL_IMAGE_URL, useValue: dependencies.images.imageUrlOf },
        {
          provide: CHANGE_BANNER,
          useValue: changeBanner({
            store: prismaBannerStore(dependencies.prisma),
            finalizeImage: dependencies.images.finalizeImage,
            discardImage: (key) => dependencies.images.storage.delete(key),
            onDiscardFailure: ({ imageKey, error }) =>
              writeLog(dependencies.logSink, {
                level: "error",
                msg: "suppression de l'ancienne bannière en échec : objet orphelin",
                imageKey,
                ...errorDetails(error),
              }),
          }),
        },
        { provide: CATEGORY_ADMIN, useValue: categoryAdmin },
        { provide: CATEGORY_IMAGE_URL, useValue: dependencies.images.imageUrlOf },
        {
          provide: SEARCH_CATEGORIES,
          useValue: searchCategories(prismaCategorySearch(dependencies.prisma)),
        },
        { provide: FOLLOW_CATEGORY, useValue: followCategory(categoryFollows) },
        { provide: UNFOLLOW_CATEGORY, useValue: unfollowCategory(categoryFollows) },
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
