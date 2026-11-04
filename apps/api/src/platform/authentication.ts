import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { err, type Result } from "@repo/result";

import { ProblemException } from "./problem.ts";

export interface AccessTokenVerifier {
  verify(token: string): Promise<Result<AccessTokenIdentity, VerificationFailure>>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol("ACCESS_TOKEN_VERIFIER");

export const rejectingVerifier: AccessTokenVerifier = {
  verify: async () => err("invalid_token"),
};

const BEARER = /^Bearer (\S+)$/i;

const identities = new WeakMap<Request, AccessTokenIdentity>();

const unauthenticated = (challenge: string) =>
  new ProblemException({
    status: 401,
    title: "Authentification requise",
    headers: { "www-authenticate": challenge },
  });

export const invalidToken = () => unauthenticated('Bearer error="invalid_token"');

const identify = async ({
  verifier,
  request,
  token,
}: {
  verifier: AccessTokenVerifier;
  request: Request;
  token: string;
}): Promise<boolean> => {
  const verified = await verifier.verify(token);
  if (!verified.ok) {
    throw invalidToken();
  }
  identities.set(request, verified.value);
  return true;
};

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(request.header("authorization") ?? "")?.[1];
    if (token === undefined) {
      throw unauthenticated("Bearer");
    }
    return identify({ verifier: this.verifier, request, token });
  }
}

@Injectable()
export class OptionalAccessTokenGuard implements CanActivate {
  constructor(@Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header("authorization");
    if (header === undefined) {
      return true;
    }
    const token = BEARER.exec(header)?.[1];
    if (token === undefined) {
      throw invalidToken();
    }
    return identify({ verifier: this.verifier, request, token });
  }
}

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenIdentity | undefined =>
    identities.get(context.switchToHttp().getRequest<Request>()),
);

export const requiredScopeGuard = (scope: string) => {
  @Injectable()
  class RequiredScopeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const identity = identities.get(context.switchToHttp().getRequest<Request>());
      if (identity === undefined || !identity.scopes.includes(scope)) {
        throw new ProblemException({ status: 403, title: "Action non autorisée" });
      }
      return true;
    }
  }
  return RequiredScopeGuard;
};
