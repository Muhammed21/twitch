import { type DynamicModule, Module } from "@nestjs/common";

import type { LogSink } from "./platform/logging.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform/platform.module.ts";

@Module({})
export class AppModule {
  static register(dependencies: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
  }): DynamicModule {
    return { module: AppModule, imports: [PlatformModule.register(dependencies)] };
  }
}
