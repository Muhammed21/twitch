import { type DynamicModule, Module } from "@nestjs/common";

import {
  IdentityModule,
  type IdentityPrisma,
  type IdentityRedis,
} from "./modules/identity/identity.module.ts";
import type { AccessTokenVerifier } from "./platform/authentication.ts";
import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";

@Module({})
export class AppModule {
  static register({
    identity,
    ...platform
  }: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
    accessTokenVerifier: AccessTokenVerifier;
    identity: { prisma: IdentityPrisma; redis: IdentityRedis };
  }): DynamicModule {
    return {
      module: AppModule,
      imports: [PlatformModule.register(platform), IdentityModule.register(identity)],
    };
  }
}
