import { Controller, Get, Header, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ZodResponse } from "nestjs-zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses, Uuid } from "@repo/contracts";
import type { Result } from "@repo/result";

import { responseDto } from "../../../openapi/response-dto.ts";
import { AccessTokenGuard, CurrentIdentity } from "../../../platform/authentication.ts";
import { ProblemException } from "../../../platform/problem.ts";
import type { StreamCredentials } from "../application/live-video-provider.ts";
import type { StreamKeyError } from "../application/stream-keys.ts";

export const GET_STREAM_KEY = Symbol("GET_STREAM_KEY");
export const ROTATE_STREAM_KEY = Symbol("ROTATE_STREAM_KEY");

type StreamKeyUseCase = (request: {
  actorId: string;
  channelId: string;
}) => Promise<Result<StreamCredentials, StreamKeyError>>;

export type GetStreamKey = StreamKeyUseCase;
export type RotateStreamKey = StreamKeyUseCase;

class StreamKey extends responseDto(responses.StreamKey) {}

const streamKeyNotFound = () =>
  new ProblemException({ status: 404, title: "Clé de stream introuvable" });

const PROBLEMS: Readonly<Record<StreamKeyError, () => ProblemException>> = {
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  not_provisioned: streamKeyNotFound,
};

const credentialsOf = async (
  useCase: StreamKeyUseCase,
  { id, identity }: { id: string; identity: AccessTokenIdentity },
): Promise<StreamCredentials> => {
  if (!Uuid.safeParse(id).success) {
    throw streamKeyNotFound();
  }
  const credentials = await useCase({ actorId: identity.userId, channelId: id });
  if (!credentials.ok) {
    throw PROBLEMS[credentials.error]();
  }
  return credentials.value;
};

@Controller("channels")
export class StreamKeyController {
  constructor(
    @Inject(GET_STREAM_KEY) private readonly getStreamKey: GetStreamKey,
    @Inject(ROTATE_STREAM_KEY) private readonly rotateStreamKey: RotateStreamKey,
  ) {}

  @Get(":id/stream-key")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "no-store")
  @ZodResponse({ status: 200, type: StreamKey })
  async read(
    @Param("id") id: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<StreamCredentials> {
    return credentialsOf(this.getStreamKey, { id, identity });
  }

  @Post(":id/stream-key/rotate")
  @HttpCode(200)
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "no-store")
  @ZodResponse({ status: 200, type: StreamKey })
  async rotate(
    @Param("id") id: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<StreamCredentials> {
    return credentialsOf(this.rotateStreamKey, { id, identity });
  }
}
