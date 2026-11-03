import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

import { Server as EngineServer, type ServerOptions, type Socket as EngineSocket } from "engine.io";
import { Server as SocketServer } from "socket.io";
import { z } from "zod";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { chatterContextFor } from "@repo/authorization";
import type { Result } from "@repo/result";

import type { MessageSender } from "../application/message-sender.ts";
import type { ChatterProfiles } from "../application/ports.ts";
import type { RoomRegistry } from "../application/room-registry.ts";
import { bindChatEvents, type ChatIo, type ChatSession, type ChatSocket } from "./chat-events.ts";

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

type Handshake =
  | { readonly status: 101; readonly identity: AccessTokenIdentity; readonly token: string }
  | { readonly status: Refusal };

const REVALIDATION_ACTIONS = {
  invalid_token: "refresh_and_reconnect",
  revoked: "stop",
} as const satisfies Record<VerificationFailure, string>;

const sessionRoomOf = (sid: string): string => `sid:${sid}`;

const handshake = async (verifier: TokenVerifier, request: IncomingMessage): Promise<Handshake> => {
  if (!String(request.url).startsWith(SOCKET_IO_PATH)) {
    return { status: 404 };
  }
  const token = bearerToken(request.headers.authorization);
  if (token === undefined) {
    return { status: 401 };
  }
  const verified = await verifier.verify(token);
  if (verified.ok) {
    return { status: 101, identity: verified.value, token };
  }
  return { status: verified.error === "revoked" ? 403 : 401 };
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
  chatters,
  rooms,
  messages,
}: {
  port: number;
  verifier: TokenVerifier;
  log: ChatLog;
  chatters: ChatterProfiles;
  rooms: RoomRegistry;
  messages: MessageSender;
}) => {
  const engine = new EngineServer(ENGINE_OPTIONS);
  const io: ChatIo = new SocketServer();
  io.bind(engine);
  engine.on("connection", (socket: EngineSocket) => {
    socket.on("message", (data: unknown) => {
      if (typeof data !== "string") {
        socket.close();
      }
    });
  });

  const sessions = new WeakMap<IncomingMessage, Promise<ChatSession | undefined>>();
  const openSession = async ({ userId, sid }: AccessTokenIdentity, token: string) => {
    const displayName = await chatters.displayNameOf(userId);
    if (displayName === null) {
      return undefined;
    }
    return {
      chatter: chatterContextFor({ userId, assignments: [], now: new Date() }),
      author: { id: userId, displayName },
      credentials: { sid, token },
    };
  };
  const attachSession = async (socket: ChatSocket, next: (error?: Error) => void) => {
    const session = await sessions.get(socket.request);
    if (session === undefined) {
      next(new Error("chatter_unavailable"));
      return;
    }
    socket.data = session;
    await socket.join(sessionRoomOf(session.credentials.sid));
    const stillValid = await verifier.verify(session.credentials.token);
    if (!stillValid.ok) {
      next(new Error("session_revoked"));
      return;
    }
    next();
  };
  io.use((socket, next) => {
    void attachSession(socket, next);
  });
  const counters = { rejectedEvents: 0 };
  bindChatEvents({
    io,
    rooms,
    messages,
    onRejectedEvent: () => {
      counters.rejectedEvents += 1;
    },
    onFailure: (error) => {
      log({ msg: "événement en échec", error: String(error) });
    },
  });

  const server = createServer(answerProbe);
  const handleUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const logInterruption = (error: Error) => {
      log({ msg: "handshake interrompu", error: error.message });
    };
    socket.on("error", logInterruption);
    const outcome = await handshake(verifier, request);
    log({ msg: "handshake", status: outcome.status });
    if (outcome.status === 101) {
      sessions.set(
        request,
        openSession(outcome.identity, outcome.token).catch((error: unknown) => {
          log({ msg: "profil illisible", error: String(error) });
          return undefined;
        }),
      );
      socket.off("error", logInterruption);
      engine.handleUpgrade(request, socket, head);
      return;
    }
    refuse(socket, outcome.status);
  };
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    void handleUpgrade(request, socket, head);
  });
  server.listen(port);
  await once(server, "listening");

  const revalidate = async (socket: ChatSocket) => {
    const verified = await verifier.verify(socket.data.credentials.token);
    if (!verified.ok) {
      socket.emit("session:revoked", { action: REVALIDATION_ACTIONS[verified.error] });
      socket.disconnect(true);
    }
  };

  return {
    port: BoundAddress.parse(server.address()).port,
    revokeSessions: (sids: readonly string[]) => {
      if (sids.length === 0) {
        return;
      }
      const revoked = io.in(sids.map(sessionRoomOf));
      revoked.emit("session:revoked", { action: "stop" });
      revoked.disconnectSockets(true);
    },
    revalidateSessions: async () => {
      await Promise.all([...io.sockets.sockets.values()].map(revalidate));
    },
    connectionCount: () => engine.clientsCount,
    rejectedEventCount: () => counters.rejectedEvents,
    close: async () => {
      engine.close();
      server.close();
      await once(server, "close");
    },
  };
};
