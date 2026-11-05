import { type DynamicModule, Module } from "@nestjs/common";

import type { AuthzRedis } from "./authz/authz-context.ts";
import {
  type ChannelPrisma,
  ChannelModule,
  createBannerUrlReader,
  createOwnedChannelReader,
} from "./modules/channel/channel.module.ts";
import { DiscoveryModule, type DiscoveryPrisma } from "./modules/discovery/discovery.module.ts";
import {
  createCurrentAccountReader,
  IdentityModule,
  type IdentityPrisma,
  type IdentityRedis,
  type LastLiveOf,
} from "./modules/identity/identity.module.ts";
import { createFeatureFlags, MobileModule } from "./modules/mobile/mobile.module.ts";
import { ModerationModule, type ModerationPrisma } from "./modules/moderation/moderation.module.ts";
import {
  createActiveEntitlementsReader,
  MonetizationModule,
  type MonetizationPrisma,
} from "./modules/monetization/monetization.module.ts";
import {
  createLastLiveReader,
  createThumbnailUrlReader,
  createViewerCountReader,
  type PresenceRedis,
  StreamModule,
  type StreamPrisma,
} from "./modules/stream/stream.module.ts";
import type { AccessTokenVerifier } from "./platform/authentication.ts";
import type { FeatureFlagsConfig, VideoProviderConfig } from "./platform/config/env.ts";
import {
  createImageBrick,
  type ImageStorage,
  ImagesModule,
} from "./platform/images/images.module.ts";
import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";
import type { WindowCounter } from "./platform/rate-limit.ts";
import type { StreamConsumerRedis } from "./platform/stream-consumer.ts";

const lastLiveOfOwner =
  ({
    ownedChannel,
    lastLiveOfChannel,
  }: {
    ownedChannel: ReturnType<typeof createOwnedChannelReader>;
    lastLiveOfChannel: ReturnType<typeof createLastLiveReader>;
  }): LastLiveOf =>
  async (userId) => {
    const channel = await ownedChannel(userId);
    return channel === null ? undefined : lastLiveOfChannel(channel.id);
  };

@Module({})
export class AppModule {
  static register({
    identity,
    channel,
    stream,
    moderation,
    monetization,
    discovery,
    mobile,
    images,
    ...platform
  }: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
    accessTokenVerifier: AccessTokenVerifier;
    identity: { prisma: IdentityPrisma; redis: IdentityRedis };
    channel: {
      prisma: ChannelPrisma;
      authzRedis: AuthzRedis;
      consumerRedis: StreamConsumerRedis;
    };
    stream: {
      prisma: StreamPrisma;
      webhookSecret: string;
      playbackBaseUrl: string;
      video: VideoProviderConfig;
      consumerRedis: StreamConsumerRedis;
      presenceRedis: PresenceRedis;
      trustedProxyCount: number;
    };
    moderation: { prisma: ModerationPrisma };
    monetization: { prisma: MonetizationPrisma; webhookAuthorization: string | undefined };
    discovery: {
      prisma: DiscoveryPrisma;
      channelConsumerRedis: StreamConsumerRedis;
      streamConsumerRedis: StreamConsumerRedis;
    };
    mobile: { featureFlags: FeatureFlagsConfig; minSupportedVersion: string };
    images: { storage: ImageStorage; publicBaseUrl: string; counter: WindowCounter };
  }): DynamicModule {
    const imageBrick = createImageBrick(images);
    const ownedChannel = createOwnedChannelReader(channel.prisma);
    const lastLiveOf = lastLiveOfOwner({
      ownedChannel,
      lastLiveOfChannel: createLastLiveReader(stream.prisma),
    });
    const bannerUrlOf = createBannerUrlReader({
      prisma: channel.prisma,
      imageUrlOf: imageBrick.imageUrlOf,
    });
    return {
      module: AppModule,
      imports: [
        PlatformModule.register(platform),
        ImagesModule.register({ images: imageBrick, counter: images.counter }),
        IdentityModule.register({
          ...identity,
          lastLiveOf,
          bannerUrlOf,
          images: imageBrick,
          logSink: platform.logSink,
        }),
        ChannelModule.register({ ...channel, logSink: platform.logSink, images: imageBrick }),
        StreamModule.register({
          ...stream,
          authzRedis: channel.authzRedis,
          logSink: platform.logSink,
        }),
        ModerationModule.register({ ...moderation, authzRedis: channel.authzRedis }),
        MonetizationModule.register({ ...monetization, logSink: platform.logSink }),
        DiscoveryModule.register({
          ...discovery,
          viewerCounts: createViewerCountReader(stream.presenceRedis),
          thumbnailUrls: createThumbnailUrlReader(stream),
          logSink: platform.logSink,
          images: imageBrick,
        }),
        MobileModule.register({
          featureFlags: createFeatureFlags(mobile.featureFlags),
          readProfile: createCurrentAccountReader({
            prisma: identity.prisma,
            lastLiveOf,
            imageUrlOf: imageBrick.imageUrlOf,
            bannerUrlOf,
          }),
          ownedChannel,
          readEntitlements: createActiveEntitlementsReader({ prisma: monetization.prisma }),
          minSupportedVersion: mobile.minSupportedVersion,
          logSink: platform.logSink,
        }),
      ],
    };
  }
}
