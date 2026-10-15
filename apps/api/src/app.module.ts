import { type DynamicModule, Module } from "@nestjs/common";

import type { AuthzRedis } from "./authz/authz-context.ts";
import { type ChannelPrisma, ChannelModule } from "./modules/channel/channel.module.ts";
import {
  IdentityModule,
  type IdentityPrisma,
  type IdentityRedis,
} from "./modules/identity/identity.module.ts";
import { StreamModule, type StreamPrisma } from "./modules/stream/stream.module.ts";
import type { AccessTokenVerifier } from "./platform/authentication.ts";
import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";
import type { StreamConsumerRedis } from "./platform/stream-consumer.ts";

@Module({})
export class AppModule {
  static register({
    identity,
    channel,
    stream,
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
    stream: { prisma: StreamPrisma; webhookSecret: string };
  }): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.register(platform),
        IdentityModule.register(identity),
        ChannelModule.register({ ...channel, logSink: platform.logSink }),
        StreamModule.register(stream),
      ],
    };
  }
}
