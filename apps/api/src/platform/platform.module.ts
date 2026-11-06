import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { createZodValidationPipe, ZodSerializerInterceptor } from "nestjs-zod";

import { noServiceCallers, SERVICE_CALLERS, type ServiceCallers } from "./admin-caller.ts";
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
    serviceCallers = noServiceCallers,
  }: {
    schemaVersionCheck: SchemaVersionCheck;
    logSink: LogSink;
    accessTokenVerifier: AccessTokenVerifier;
    serviceCallers?: ServiceCallers;
  }): DynamicModule {
    return {
      module: PlatformModule,
      global: true,
      exports: [ACCESS_TOKEN_VERIFIER, AccessTokenGuard, SERVICE_CALLERS, LOG_SINK],
      controllers: [HealthController],
      providers: [
        { provide: SCHEMA_VERSION_CHECK, useValue: schemaVersionCheck },
        { provide: LOG_SINK, useValue: logSink },
        { provide: ACCESS_TOKEN_VERIFIER, useValue: accessTokenVerifier },
        { provide: SERVICE_CALLERS, useValue: serviceCallers },
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
