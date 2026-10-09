import { type DynamicModule, Module } from "@nestjs/common";

import { IdentityModule, type IdentityPrisma } from "./modules/identity/identity.module.ts";
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
    identity: { prisma: IdentityPrisma };
  }): DynamicModule {
    return {
      module: AppModule,
      imports: [PlatformModule.register(platform), IdentityModule.register(identity)],
    };
  }
}
