import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

import { Server as EngineServer, type ServerOptions, type Socket as EngineSocket } from "engine.io";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import type { Result } from "@repo/result";

const SOCKET_IO_PATH = "/socket.io/";

const BoundAddress = z.object({ port: z.int() });

const ENGINE_OPTIONS: Partial<ServerOptions> = {
  transports: ["websocket"],
  maxHttpBufferSize: 4096,
  pingInterval: 30_000,
  pingTimeout: 60_000,
};

const REFUSALS = { 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" } as const;

type Refusal = keyof typeof REFUSALS;

const PROBES = new Map([
  ["/health/live", { status: "ok" }],
  ["/health/ready", { status: "ready" }],
]);

export type TokenVerifier = {
  verify(token: string): Promise<Result<AccessTokenIdentity, VerificationFailure>>;
};

export type ChatLog = (entry: Readonly<Record<string, unknown>>) => void;

const bearerToken = (header: string | undefined): string | undefined =>
  /^Bearer (\S+)$/i.exec(String(header))?.[1];

const handshakeStatus = async (
  verifier: TokenVerifier,
  request: IncomingMessage,
): Promise<101 | Refusal> => {
  if (!String(request.url).startsWith(SOCKET_IO_PATH)) {
    return 404;
  }
  const token = bearerToken(request.headers.authorization);
  if (token === undefined) {
    return 401;
  }
  const verified = await verifier.verify(token);
  if (verified.ok) {
    return 101;
  }
  return verified.error === "revoked" ? 403 : 401;
};

const refuse = (socket: Duplex, status: Refusal): void => {
  socket.end(
    `HTTP/1.1 ${status} ${REFUSALS[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
};

const answerProbe = (request: IncomingMessage, response: ServerResponse): void => {
  const body = PROBES.get(String(request.url));
  if (body === undefined) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
};

export const startChatServer = async ({
  port,
  verifier,
  log,
}: {
  port: number;
  verifier: TokenVerifier;
  log: ChatLog;
}) => {
  const engine = new EngineServer(ENGINE_OPTIONS);
  const io = new SocketServer();
  io.bind(engine);
  engine.on("connection", (socket: EngineSocket) => {
    socket.on("message", (data: unknown) => {
      if (typeof data !== "string") {
        socket.close();
      }
    });
  });

  const server = createServer(answerProbe);
  const handleUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const status = await handshakeStatus(verifier, request);
    log({ msg: "handshake", status });
    if (status === 101) {
      engine.handleUpgrade(request, socket, head);
      return;
    }
    refuse(socket, status);
  };
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    void handleUpgrade(request, socket, head);
  });
  server.listen(port);
  await once(server, "listening");

  return {
    port: BoundAddress.parse(server.address()).port,
    connectionCount: () => engine.clientsCount,
    close: async () => {
      engine.close();
      server.close();
      await once(server, "close");
    },
  };
};
