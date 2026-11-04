import { type DynamicModule, Module } from "@nestjs/common";

import type { AuthzRedis } from "./authz/authz-context.ts";
import {
  type ChannelPrisma,
  ChannelModule,
  createOwnedChannelReader,
} from "./modules/channel/channel.module.ts";
import { DiscoveryModule, type DiscoveryPrisma } from "./modules/discovery/discovery.module.ts";
import {
  createCurrentAccountReader,
  IdentityModule,
  type IdentityPrisma,
  type IdentityRedis,
} from "./modules/identity/identity.module.ts";
import { createFeatureFlags, MobileModule } from "./modules/mobile/mobile.module.ts";
import { ModerationModule, type ModerationPrisma } from "./modules/moderation/moderation.module.ts";
import {
  createViewerCountReader,
  type PresenceRedis,
  StreamModule,
  type StreamPrisma,
} from "./modules/stream/stream.module.ts";
import type { AccessTokenVerifier } from "./platform/authentication.ts";
import type { FeatureFlagsConfig, VideoProviderConfig } from "./platform/config/env.ts";
import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";
import type { StreamConsumerRedis } from "./platform/stream-consumer.ts";

@Module({})
export class AppModule {
  static register({
    identity,
    channel,
    stream,
    moderation,
    discovery,
    mobile,
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
    discovery: {
      prisma: DiscoveryPrisma;
      channelConsumerRedis: StreamConsumerRedis;
      streamConsumerRedis: StreamConsumerRedis;
    };
    mobile: { featureFlags: FeatureFlagsConfig; minSupportedVersion: string };
  }): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.register(platform),
        IdentityModule.register({
          ...identity,
          ownedChannel: createOwnedChannelReader(channel.prisma),
        }),
        ChannelModule.register({ ...channel, logSink: platform.logSink }),
        StreamModule.register({
          ...stream,
          authzRedis: channel.authzRedis,
          logSink: platform.logSink,
        }),
        ModerationModule.register({ ...moderation, authzRedis: channel.authzRedis }),
        DiscoveryModule.register({
          ...discovery,
          viewerCounts: createViewerCountReader(stream.presenceRedis),
          logSink: platform.logSink,
        }),
        MobileModule.register({
          featureFlags: createFeatureFlags(mobile.featureFlags),
          readProfile: createCurrentAccountReader(identity.prisma),
          minSupportedVersion: mobile.minSupportedVersion,
          logSink: platform.logSink,
        }),
      ],
    };
  }
}
