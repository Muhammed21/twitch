import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";

import { z } from "zod";

import type { Problem } from "@repo/video-contract";

export type HttpServer = {
  readonly port: number;
  readonly startDraining: () => void;
  readonly close: () => Promise<void>;
};

const BoundAddress = z.object({ port: z.int() });

const sendJson = (response: ServerResponse, body: { readonly status: string }): void => {
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
};

const sendProblem = (
  response: ServerResponse,
  problem: Pick<Problem, "title" | "status">,
): void => {
  response
    .writeHead(problem.status, { "content-type": "application/problem+json" })
    .end(JSON.stringify({ type: "about:blank", ...problem }));
};

export const startHttpServer = async ({ port }: { port: number }): Promise<HttpServer> => {
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
    sendProblem(response, { title: "Ressource introuvable", status: 404 });
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
