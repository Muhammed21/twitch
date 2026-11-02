import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";

import { z } from "zod";

import type { Problem } from "@repo/video-contract";

import type { ControlPlane } from "../control-plane/control-plane.ts";
import { type Reply, routeControlPlane } from "./control-plane-routes.ts";

export type HttpServer = {
  readonly port: number;
  readonly startDraining: () => void;
  readonly close: () => Promise<void>;
};

const BoundAddress = z.object({ port: z.int() });

const sendJson = (response: ServerResponse, body: object, status = 200): void => {
  response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
};

const sendProblem = (
  response: ServerResponse,
  problem: Pick<Problem, "title" | "status" | "errors">,
  headers: Readonly<Record<string, string>> = {},
): void => {
  response
    .writeHead(problem.status, { ...headers, "content-type": "application/problem+json" })
    .end(JSON.stringify({ type: "about:blank", ...problem }));
};

const send = (response: ServerResponse, reply: Reply): void => {
  switch (reply.kind) {
    case "json":
      sendJson(response, reply.body, reply.status);
      return;
    case "empty":
      response.writeHead(reply.status).end();
      return;
    case "problem":
      sendProblem(response, reply.problem, reply.headers);
  }
};

export const startHttpServer = async ({
  port,
  serviceSecret,
  controlPlane,
}: {
  port: number;
  serviceSecret: string;
  controlPlane: ControlPlane;
}): Promise<HttpServer> => {
  const state: { draining: boolean } = { draining: false };

  const server = createServer((request, response) => {
    const target = URL.parse(String(request.url), "http://localhost");
    if (target === null) {
      sendProblem(response, { title: "Requête invalide", status: 400 });
      return;
    }
    const route = `${request.method} ${target.pathname}`;
    if (route === "GET /health/live") {
      sendJson(response, { status: "ok" });
      return;
    }
    if (route === "GET /health/ready") {
      if (state.draining) {
        sendProblem(response, { title: "Service indisponible", status: 503 });
        return;
      }
      sendJson(response, { status: "ready" });
      return;
    }
    void routeControlPlane({
      controlPlane,
      serviceSecret,
      request,
      pathname: target.pathname,
    }).then((reply) => send(response, reply));
  });

  server.listen(port);
  await once(server, "listening");
  const { port: boundPort } = BoundAddress.parse(server.address());

  return {
    port: boundPort,
    startDraining: () => {
      state.draining = true;
    },
    close: async () => {
      const closed = once(server, "close");
      server.close();
      await closed;
    },
  };
};
