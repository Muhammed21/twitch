import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { createZodValidationPipe, ZodSerializerInterceptor } from "nestjs-zod";

import {
  ACCESS_TOKEN_VERIFIER,
  AccessTokenGuard,
  type AccessTokenVerifier,
} from "./authentication.ts";
import {
  HealthController,
  SCHEMA_VERSION_CHECK,
  type SchemaVersionCheck,
} from "./health.controller.ts";
import { LOG_SINK, type LogSink } from "./logging.ts";
import { ProblemFilter, toInvalidRequest } from "./problem.ts";

export type { SchemaVersionCheck } from "./health.controller.ts";

@Module({})
export class PlatformModule {
  static register({
    schemaVersionCheck,
    logSink,
    accessTokenVerifier,
  }: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
    accessTokenVerifier: AccessTokenVerifier;
  }): DynamicModule {
    return {
      module: PlatformModule,
      global: true,
      exports: [ACCESS_TOKEN_VERIFIER, AccessTokenGuard],
      controllers: [HealthController],
      providers: [
        { provide: SCHEMA_VERSION_CHECK, useValue: schemaVersionCheck },
        { provide: LOG_SINK, useValue: logSink },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: accessTokenVerifier },
        AccessTokenGuard,
        { provide: APP_FILTER, useClass: ProblemFilter },
        {
          provide: APP_PIPE,
          useClass: createZodValidationPipe({ createValidationException: toInvalidRequest }),
        },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}
