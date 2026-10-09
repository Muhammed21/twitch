import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

import { type LogSink, writeLog } from "./logging.ts";
import { pathOf } from "./problem.ts";

const CORRELATION_HEADER = "x-correlation-id";
const PROVIDED_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const requestContext =
  (sink: LogSink) =>
  (request: Request, response: Response, next: NextFunction): void => {
    const provided = request.header(CORRELATION_HEADER);
    const correlationId =
      provided !== undefined && PROVIDED_ID.test(provided) ? provided : randomUUID();
    const startedAt = performance.now();
    response.locals["correlationId"] = correlationId;
    response.setHeader(CORRELATION_HEADER, correlationId);
    response.on("finish", () => {
      writeLog(sink, {
        level: "info",
        msg: "request",
        method: request.method,
        path: pathOf(request),
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        correlationId,
      });
    });
    next();
  };
