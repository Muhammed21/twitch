import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  type Type,
} from "@nestjs/common";
import type { Request, Response } from "express";

import {
  ACTING_USER_HEADER,
  type ActingUserVerifier,
  createActingUserVerifier,
  importActingUserPublicKey,
} from "@repo/auth-verifier";
import { err } from "@repo/result";

import {
  ACCESS_TOKEN_VERIFIER,
  AccessTokenGuard,
  type AccessTokenVerifier,
  identityOf,
} from "./authentication.ts";
import type { PayloadAdminConfig } from "./config/env.ts";
import { LOG_SINK, type LogSink, writeLog } from "./logging.ts";
import { ProblemException } from "./problem.ts";
import {
  authenticateService,
  PAYLOAD_ADMIN_ACCOUNT,
  type ServiceAccount,
} from "./service-accounts.ts";

export type AdminActor = {
  readonly actorId: string;
  readonly onBehalfOf: string | null;
  readonly source: "api" | "payload";
};

export type ServiceCallers = {
  readonly accounts: readonly ServiceAccount[];
  readonly actingUser: ActingUserVerifier;
  readonly now: () => Date;
};

export const SERVICE_CALLERS = Symbol("SERVICE_CALLERS");

export const noServiceCallers: ServiceCallers = {
  accounts: [],
  actingUser: { verify: async () => err("invalid") },
  now: () => new Date(),
};

const SERVICE = /^Service (\S+)$/i;

const actors = new WeakMap<Request, AdminActor>();

const forbidden = () => new ProblemException({ status: 403, title: "Action non autorisée" });

type Refusal = "missing_acting_user" | "expired" | "invalid" | "missing_scope";

const resolveActingUser = async ({
  request,
  callers,
}: {
  request: Request;
  callers: ServiceCallers;
}): Promise<{ actorId: string } | { refusal: Refusal }> => {
  const header = request.header(ACTING_USER_HEADER);
  if (header === undefined) {
    return { refusal: "missing_acting_user" };
  }
  const verified = await callers.actingUser.verify(header, callers.now());
  return verified.ok ? { actorId: verified.value.userId } : { refusal: verified.error };
};

type Decision =
  | { readonly actorId: string; readonly reason?: undefined }
  | { readonly actorId: string | null; readonly reason: Refusal };

const decide = async ({
  request,
  callers,
  account,
  scope,
}: {
  request: Request;
  callers: ServiceCallers;
  account: ServiceAccount;
  scope: string;
}): Promise<Decision> => {
  const resolved = await resolveActingUser({ request, callers });
  if ("refusal" in resolved) {
    return { actorId: null, reason: resolved.refusal };
  }
  return account.scopes.includes(scope)
    ? { actorId: resolved.actorId }
    : { actorId: resolved.actorId, reason: "missing_scope" };
};

const journal = ({
  sink,
  request,
  response,
  account,
  scope,
  decision,
}: {
  sink: LogSink;
  request: Request;
  response: Response;
  account: ServiceAccount;
  scope: string;
  decision: Decision;
}) => {
  response.on("finish", () => {
    writeLog(sink, {
      level: "info",
      msg: "admin.acting_user",
      ...decision,
      onBehalfOf: account.id,
      scope,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      outcome: response.statusCode < 400 ? "allowed" : "refused",
    });
  });
};

const asUser = async ({
  context,
  request,
  verifier,
  scope,
}: {
  context: ExecutionContext;
  request: Request;
  verifier: AccessTokenVerifier;
  scope: string;
}): Promise<boolean> => {
  await new AccessTokenGuard(verifier).canActivate(context);
  const identity = identityOf(request);
  if (identity?.scopes.includes(scope) !== true) {
    throw forbidden();
  }
  actors.set(request, { actorId: identity.userId, onBehalfOf: null, source: "api" });
  return true;
};

export const adminCallerGuard = (scope: string): Type<CanActivate> => {
  @Injectable()
  class AdminCallerGuard implements CanActivate {
    readonly #verifier: AccessTokenVerifier;
    readonly #callers: ServiceCallers;
    readonly #sink: LogSink;

    constructor(
      @Inject(ACCESS_TOKEN_VERIFIER) verifier: AccessTokenVerifier,
      @Inject(SERVICE_CALLERS) callers: ServiceCallers,
      @Inject(LOG_SINK) sink: LogSink,
    ) {
      this.#verifier = verifier;
      this.#callers = callers;
      this.#sink = sink;
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest<Request>();
      const secret = SERVICE.exec(request.header("authorization") ?? "")?.[1];
      if (secret === undefined) {
        return asUser({ context, request, verifier: this.#verifier, scope });
      }
      const account = authenticateService({ accounts: this.#callers.accounts, secret });
      if (account === undefined) {
        throw new ProblemException({
          status: 401,
          title: "Authentification requise",
          headers: { "www-authenticate": "Service" },
        });
      }
      const decision = await decide({ request, callers: this.#callers, account, scope });
      journal({
        sink: this.#sink,
        request,
        response: context.switchToHttp().getResponse<Response>(),
        account,
        scope,
        decision,
      });
      if (decision.reason !== undefined) {
        throw forbidden();
      }
      actors.set(request, { actorId: decision.actorId, onBehalfOf: account.id, source: "payload" });
      return true;
    }
  }
  return AdminCallerGuard;
};

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminActor | undefined =>
    actors.get(context.switchToHttp().getRequest<Request>()),
);

export const serviceCallersFor = async (
  payloadAdmin: PayloadAdminConfig | undefined,
): Promise<ServiceCallers> =>
  payloadAdmin === undefined
    ? noServiceCallers
    : {
        accounts: [{ ...PAYLOAD_ADMIN_ACCOUNT, secret: payloadAdmin.serviceSecret }],
        actingUser: createActingUserVerifier({
          publicKey: await importActingUserPublicKey(payloadAdmin.actingUserPublicKey),
        }),
        now: () => new Date(),
      };
