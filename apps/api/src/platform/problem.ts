import { STATUS_CODES } from "node:http";

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ZodError } from "zod";

import { errorDetails, LOG_SINK, type LogSink, writeLog } from "./logging.ts";

type Problem = {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string | undefined;
  readonly errors?: readonly { path: string; message: string }[];
};

export class ProblemException extends Error {
  readonly problem: Problem;

  constructor({
    status,
    title,
    type = "about:blank",
    detail,
  }: Omit<Problem, "type" | "errors"> & { type?: string }) {
    super(title);
    this.problem = { type, title, status, detail };
  }
}

export class InvalidRequestException extends Error {
  readonly validation: ZodError;

  constructor(validation: ZodError) {
    super(validation.message);
    this.validation = validation;
  }
}

const toProblem = (exception: unknown): Problem => {
  if (exception instanceof ProblemException) {
    return exception.problem;
  }
  if (exception instanceof InvalidRequestException) {
    return {
      type: "about:blank",
      title: "Requête invalide",
      status: 400,
      errors: exception.validation.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return { type: "about:blank", title: STATUS_CODES[status] ?? "Erreur", status };
  }
  return { type: "about:blank", title: "Erreur interne", status: 500 };
};

export const pathOf = ({ originalUrl }: Request): string => {
  const queryStart = originalUrl.indexOf("?");
  return queryStart === -1 ? originalUrl : originalUrl.slice(0, queryStart);
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(LOG_SINK) private readonly sink: LogSink) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const correlationId: unknown = response.locals["correlationId"];
    const problem = toProblem(exception);
    if (problem.status >= 500 && !(exception instanceof ProblemException)) {
      writeLog(this.sink, {
        level: "error",
        msg: "unhandled",
        correlationId,
        ...errorDetails(exception),
      });
    }
    response
      .status(problem.status)
      .type("application/problem+json")
      .json({ ...problem, instance: pathOf(request), correlationId });
  }
}
