import { Controller, Get, Header, Inject, Param, UseGuards } from "@nestjs/common";
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

export type GetStreamKey = (request: {
  actorId: string;
  channelId: string;
}) => Promise<Result<StreamCredentials, StreamKeyError>>;

class StreamKey extends responseDto(responses.StreamKey) {}

const streamKeyNotFound = () =>
  new ProblemException({ status: 404, title: "Clé de stream introuvable" });

const PROBLEMS: Readonly<Record<StreamKeyError, () => ProblemException>> = {
  forbidden: () => new ProblemException({ status: 403, title: "Action non autorisée" }),
  not_provisioned: streamKeyNotFound,
};

@Controller("channels")
export class StreamKeyController {
  constructor(@Inject(GET_STREAM_KEY) private readonly getStreamKey: GetStreamKey) {}

  @Get(":id/stream-key")
  @UseGuards(AccessTokenGuard)
  @Header("Cache-Control", "no-store")
  @ZodResponse({ status: 200, type: StreamKey })
  async read(
    @Param("id") id: string,
    @CurrentIdentity() identity: AccessTokenIdentity,
  ): Promise<StreamCredentials> {
    if (!Uuid.safeParse(id).success) {
      throw streamKeyNotFound();
    }
    const credentials = await this.getStreamKey({ actorId: identity.userId, channelId: id });
    if (!credentials.ok) {
      throw PROBLEMS[credentials.error]();
    }
    return credentials.value;
  }
}
