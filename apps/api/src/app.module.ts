import { type DynamicModule, Module } from "@nestjs/common";

import { IdentityModule } from "./modules/identity/identity.module.ts";
import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";

@Module({})
export class AppModule {
  static register(dependencies: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
  }): DynamicModule {
    return { module: AppModule, imports: [PlatformModule.register(dependencies), IdentityModule] };
  }
}
