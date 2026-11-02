import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { CreateChannelRequest, type Problem } from "@repo/video-contract";

import type { ControlPlane } from "../control-plane/control-plane.ts";

export type Reply =
  | { readonly kind: "json"; readonly status: number; readonly body: object }
  | { readonly kind: "empty"; readonly status: number }
  | {
      readonly kind: "problem";
      readonly problem: Pick<Problem, "title" | "status" | "errors">;
      readonly headers?: Readonly<Record<string, string>>;
    };

const MAX_BODY_BYTES = 16 * 1024;

const problem = (status: number, title: string, extra: Pick<Problem, "errors"> = {}): Reply => ({
  kind: "problem",
  problem: { title, status, ...extra },
});

const NOT_FOUND = problem(404, "Ressource introuvable");
const INVALID_REQUEST = problem(400, "Requête invalide");
const INTERNAL_ERROR = problem(500, "Erreur interne");
const UNAUTHENTICATED: Reply = {
  kind: "problem",
  problem: { title: "Authentification requise", status: 401 },
  headers: { "www-authenticate": "Bearer" },
};

const ROTATION_REFUSALS: Readonly<Record<"not_found" | "invalid_entropy", Reply>> = {
  not_found: NOT_FOUND,
  invalid_entropy: INTERNAL_ERROR,
};

const STOP_REFUSALS: Readonly<Record<"not_found" | "not_live", Reply>> = {
  not_found: NOT_FOUND,
  not_live: problem(409, "Aucun live en cours"),
};

const digest = (value: string) => createHash("sha256").update(value).digest();

const BEARER = /^Bearer (.+)/;

const isAuthorized = (authorization: string | undefined, serviceSecret: string): boolean => {
  const presented = BEARER.exec(authorization ?? "")?.[1];
  return presented !== undefined && timingSafeEqual(digest(presented), digest(serviceSecret));
};

const readBody = async (request: IncomingMessage): Promise<Buffer | "too_large"> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) {
      return "too_large";
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const parseJson = (body: Buffer): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(body.toString("utf8")) };
  } catch {
    return { ok: false };
  }
};

const createChannel = async (controlPlane: ControlPlane, request: IncomingMessage) => {
  const body = await readBody(request);
  if (body === "too_large") {
    return problem(413, "Corps de requête trop volumineux");
  }
  const json = parseJson(body);
  if (!json.ok) {
    return INVALID_REQUEST;
  }
  const parsed = CreateChannelRequest.safeParse(json.value);
  if (!parsed.success) {
    return problem(400, "Requête invalide", {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const provisioned = await controlPlane.createChannel(parsed.data.externalId);
  if (!provisioned.ok) {
    return INTERNAL_ERROR;
  }
  const { channel, created } = provisioned.value;
  return {
    kind: "json",
    status: created ? 201 : 200,
    body: { id: channel.id, externalId: channel.externalId },
  } satisfies Reply;
};

type Route = {
  readonly method: string;
  readonly path: RegExp;
  readonly handle: (input: {
    controlPlane: ControlPlane;
    request: IncomingMessage;
    channelId: string;
  }) => Promise<Reply>;
};

const CHANNEL = "([^/]+)";

const ROUTES: readonly Route[] = [
  {
    method: "POST",
    path: /^\/channels$/,
    handle: ({ controlPlane, request }) => createChannel(controlPlane, request),
  },
  {
    method: "GET",
    path: new RegExp(`^/channels/${CHANNEL}/stream-key$`),
    handle: async ({ controlPlane, channelId }) => {
      const credentials = await controlPlane.streamKey(channelId);
      return credentials === undefined
        ? NOT_FOUND
        : { kind: "json", status: 200, body: credentials };
    },
  },
  {
    method: "POST",
    path: new RegExp(`^/channels/${CHANNEL}/stream-key/rotate$`),
    handle: async ({ controlPlane, channelId }) => {
      const credentials = await controlPlane.rotateStreamKey(channelId);
      if (credentials.ok) {
        return { kind: "json", status: 200, body: credentials.value };
      }
      return ROTATION_REFUSALS[credentials.error];
    },
  },
  {
    method: "POST",
    path: new RegExp(`^/channels/${CHANNEL}/stop$`),
    handle: async ({ controlPlane, channelId }) => {
      const stopped = await controlPlane.stopStream(channelId, new Date());
      if (stopped.ok) {
        return { kind: "empty", status: 204 };
      }
      return STOP_REFUSALS[stopped.error];
    },
  },
  {
    method: "GET",
    path: /^\/streams$/,
    handle: async ({ controlPlane }) => ({
      kind: "json",
      status: 200,
      body: {
        streams: (await controlPlane.liveStreams()).map((session) => ({
          sessionId: session.id,
          channelId: session.channelId,
          startedAt: session.startedAt.toISOString(),
        })),
      },
    }),
  },
];

export const routeControlPlane = async ({
  controlPlane,
  serviceSecret,
  request,
  pathname,
}: {
  controlPlane: ControlPlane;
  serviceSecret: string;
  request: IncomingMessage;
  pathname: string;
}): Promise<Reply> => {
  const route = ROUTES.find(({ method, path }) => method === request.method && path.test(pathname));
  if (route === undefined) {
    return NOT_FOUND;
  }
  if (!isAuthorized(request.headers.authorization, serviceSecret)) {
    return UNAUTHENTICATED;
  }
  try {
    return await route.handle({
      controlPlane,
      request,
      channelId: route.path.exec(pathname)?.[1] ?? "",
    });
  } catch {
    return INTERNAL_ERROR;
  }
};
