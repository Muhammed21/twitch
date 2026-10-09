import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";

import {
  HealthController,
  SCHEMA_VERSION_CHECK,
  type SchemaVersionCheck,
} from "./health.controller.ts";
import { LOG_SINK, type LogSink } from "./logging.ts";
import { ProblemFilter } from "./problem.ts";

export type { SchemaVersionCheck } from "./health.controller.ts";

@Module({})
export class PlatformModule {
  static register({
    schemaVersionCheck,
    logSink,
  }: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
  }): DynamicModule {
    return {
      module: PlatformModule,
      controllers: [HealthController],
      providers: [
        { provide: SCHEMA_VERSION_CHECK, useValue: schemaVersionCheck },
        { provide: LOG_SINK, useValue: logSink },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
