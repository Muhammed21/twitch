import { Controller, Get, Inject } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";

import { errorDetails, LOG_SINK, type LogSink, writeLog } from "./logging.ts";
import { ProblemException } from "./problem.ts";

export type SchemaVersionCheck = () => Promise<void>;

export const SCHEMA_VERSION_CHECK = Symbol("SCHEMA_VERSION_CHECK");

@ApiExcludeController()
@Controller("health")
export class HealthController {
  constructor(
    @Inject(SCHEMA_VERSION_CHECK) private readonly schemaVersionCheck: SchemaVersionCheck,
    @Inject(LOG_SINK) private readonly sink: LogSink,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    try {
      await this.schemaVersionCheck();
    } catch (error) {
      writeLog(this.sink, { level: "error", msg: "not ready", ...errorDetails(error) });
      throw new ProblemException({ status: 503, title: "Service indisponible" });
    }
    return { status: "ready" };
  }
}
