import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

import { Server as EngineServer, type ServerOptions, type Socket as EngineSocket } from "engine.io";
import { Server as SocketServer, type ServerOptions as SocketOptions } from "socket.io";
import { z } from "zod";

import type { AccessTokenIdentity, VerificationFailure } from "@repo/auth-verifier";
import { type ChatSanction, chatterContextFor } from "@repo/authorization";
import type { Result } from "@repo/result";

import type { MessageSender } from "../application/message-sender.ts";
import type { ChatterProfiles, ChatterSanction, TurboProfiles } from "../application/ports.ts";
import type { RoomRegistry } from "../application/room-registry.ts";
import {
  bindChatEvents,
  type ChatIo,
  type ChatSession,
  type ChatSocket,
  roomOf,
  SATURATED_ROOM,
} from "./chat-events.ts";
import { createHistogram, renderMetrics } from "./metrics.ts";
import { createSaturationGuard } from "./saturation-guard.ts";
import { pendingPacketsOf } from "./write-buffer.ts";

const SOCKET_IO_PATH = "/socket.io/";

const BoundAddress = z.object({ port: z.int() });

const ENGINE_OPTIONS: Partial<ServerOptions> = {
  transports: ["websocket"],
  maxHttpBufferSize: 4096,
  pingInterval: 30_000,
  pingTimeout: 60_000,
};

const REFUSALS = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  503: "Service Unavailable",
} as const;

const SHUTDOWN_BATCHES = 10;

const SATURATION_TICK_MS = 10;

const SANCTION_DELAY_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

export type SaturationLimits = { readonly maxPackets: number; readonly closeAfterMs: number };

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

const answerProbe =
  ({ isDraining, metrics }: { isDraining: () => boolean; metrics: () => string }) =>
  (request: IncomingMessage, response: ServerResponse): void => {
    if (request.url === "/metrics") {
      response.writeHead(200, { "content-type": METRICS_CONTENT_TYPE }).end(metrics());
      return;
    }
    const body = PROBES.get(String(request.url));
    if (body === undefined) {
      response.writeHead(404).end();
      return;
    }
    if (request.url === "/health/ready" && isDraining()) {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  };

export const startChatServer = async ({
  port,
  verifier,
  log,
  chatters,
  turbos,
  rooms,
  messages,
  saturation,
  adapter,
  imageUrlOf,
}: {
  port: number;
  verifier: TokenVerifier;
  log: ChatLog;
  chatters: ChatterProfiles;
  turbos: TurboProfiles;
  rooms: RoomRegistry;
  messages: MessageSender;
  saturation: SaturationLimits;
  adapter: SocketOptions["adapter"];
  imageUrlOf?: (key: string) => string;
}) => {
  const engine = new EngineServer(ENGINE_OPTIONS);
  const io: ChatIo = new SocketServer({ adapter });
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
    const [displayName, sanctions, avatarKey, turbo] = await Promise.all([
      chatters.displayNameOf(userId),
      chatters.sanctionsOf(userId),
      chatters.avatarKeyOf(userId),
      turbos.turboOf(userId),
    ]);
    if (displayName === null) {
      return undefined;
    }
    return {
      chatter: { ...chatterContextFor({ userId, assignments: [], now: new Date() }), sanctions },
      author: {
        id: userId,
        displayName,
        ...(avatarKey === null || imageUrlOf === undefined
          ? {}
          : { avatarUrl: imageUrlOf(avatarKey) }),
      },
      turbo,
      credentials: { sid, token },
    };
  };
  const recentSanctions = new Map<string, readonly ChatSanction[]>();
  const withSanctions = (session: ChatSession, added: readonly ChatSanction[]): ChatSession => ({
    ...session,
    chatter: { ...session.chatter, sanctions: [...session.chatter.sanctions, ...added] },
  });
  const attachSession = async (socket: ChatSocket, next: (error?: Error) => void) => {
    const session = await sessions.get(socket.request);
    if (session === undefined) {
      next(new Error("chatter_unavailable"));
      return;
    }
    await socket.join(sessionRoomOf(session.credentials.sid));
    const stillValid = await verifier.verify(session.credentials.token);
    if (!stillValid.ok) {
      next(new Error("session_revoked"));
      return;
    }
    socket.data = withSanctions(session, recentSanctions.get(session.author.id) ?? []);
    next();
  };
  io.use((socket, next) => {
    void attachSession(socket, next);
  });
  const counters = { rejectedEvents: 0, saturationClosures: 0, messages: 0, deliveries: 0 };
  const sanctionDelays = createHistogram(SANCTION_DELAY_BUCKETS_SECONDS);
  bindChatEvents({
    io,
    rooms,
    messages,
    onRejectedEvent: () => {
      counters.rejectedEvents += 1;
    },
    onBroadcast: () => {
      counters.messages += 1;
    },
    onDelivery: () => {
      counters.deliveries += 1;
    },
    onFailure: (error) => {
      log({ msg: "événement en échec", error: String(error) });
    },
  });

  const state = { draining: false };
  const guard = createSaturationGuard(saturation);
  const metrics = () =>
    renderMetrics([
      {
        name: "chat_connections",
        help: "Connexions actives.",
        type: "gauge",
        value: engine.clientsCount,
      },
      {
        name: "chat_rooms_loaded",
        help: "Salons chargés en mémoire.",
        type: "gauge",
        value: rooms.loadedCount(),
      },
      {
        name: "chat_saturated_sockets",
        help: "Sockets exclues de la diffusion pour saturation.",
        type: "gauge",
        value: guard.saturatedCount(),
      },
      {
        name: "chat_messages_total",
        help: "Messages de chat diffusés.",
        type: "counter",
        value: counters.messages,
      },
      {
        name: "chat_deliveries_total",
        help: "Livraisons de messages de chat, destinataires compris.",
        type: "counter",
        value: counters.deliveries,
      },
      {
        name: "chat_rejected_events_total",
        help: "Trames rejetées par la validation.",
        type: "counter",
        value: counters.rejectedEvents,
      },
      {
        name: "chat_saturation_closures_total",
        help: "Sockets fermées après une saturation prolongée.",
        type: "counter",
        value: counters.saturationClosures,
      },
      {
        name: "chat_sanction_exclusion_delay_seconds",
        help: "Délai entre une sanction et son application aux sockets du chatter.",
        type: "histogram",
        histogram: sanctionDelays,
      },
    ]);
  const server = createServer(answerProbe({ isDraining: () => state.draining, metrics }));
  const handleUpgrade = async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const logInterruption = (error: Error) => {
      log({ msg: "handshake interrompu", error: error.message });
    };
    socket.on("error", logInterruption);
    const outcome = await handshake(verifier, request);
    if (state.draining) {
      refuse(socket, 503);
      return;
    }
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

  const applySanction = ({ userId, channelId, expiresAt }: ChatterSanction) => {
    const now = Date.now();
    const sanction = { channelId, expiresAt };
    recentSanctions.forEach((recent, user) => {
      if (recent.every((entry) => entry.expiresAt !== null && entry.expiresAt.getTime() <= now)) {
        recentSanctions.delete(user);
      }
    });
    recentSanctions.set(userId, [...(recentSanctions.get(userId) ?? []), sanction]);
    io.sockets.sockets.forEach((socket) => {
      if (socket.data.author.id === userId) {
        socket.data = withSanctions(socket.data, [sanction]);
      }
    });
    io.local.to(roomOf(channelId)).emit("chat:user_cleared", { channelId, userId });
  };

  const ban = (sanction: ChatterSanction) => {
    applySanction(sanction);
    io.sockets.sockets.forEach((socket) => {
      if (
        socket.data.author.id === sanction.userId &&
        socket.rooms.has(roomOf(sanction.channelId))
      ) {
        socket.emit("chat:rejected", { reason: "banned" });
        socket.disconnect(true);
      }
    });
  };

  const guarded = (socket: ChatSocket) => ({
    id: socket.id,
    pendingPackets: () => pendingPacketsOf(socket.conn),
    saturate: () => {
      void socket.join(SATURATED_ROOM);
    },
    release: () => {
      void socket.leave(SATURATED_ROOM);
    },
    close: () => {
      socket.conn.close(true);
    },
  });
  const saturationTick = setInterval(() => {
    const { closed } = guard.inspect([...io.sockets.sockets.values()].map(guarded), Date.now());
    counters.saturationClosures += closed;
  }, SATURATION_TICK_MS);

  const revalidate = async (socket: ChatSocket) => {
    const verified = await verifier.verify(socket.data.credentials.token);
    if (!verified.ok) {
      socket.emit("session:revoked", { action: REVALIDATION_ACTIONS[verified.error] });
      socket.disconnect(true);
      return;
    }
    const turbo = await turbos.turboOf(socket.data.author.id);
    socket.data = { ...socket.data, turbo };
  };

  return {
    port: BoundAddress.parse(server.address()).port,
    revokeSessions: (sids: readonly string[]) => {
      if (sids.length === 0) {
        return;
      }
      const revoked = io.local.in(sids.map(sessionRoomOf));
      revoked.emit("session:revoked", { action: "stop" });
      revoked.disconnectSockets(true);
    },
    sanction: applySanction,
    ban,
    pendingSanctionCount: () => recentSanctions.size,
    sanctionApplied: (sanctionedAt: Date) => {
      sanctionDelays.observe((Date.now() - sanctionedAt.getTime()) / 1000);
    },
    revalidateSessions: async () => {
      await Promise.all([...io.sockets.sockets.values()].map(revalidate));
    },
    connectionCount: () => engine.clientsCount,
    rejectedEventCount: () => counters.rejectedEvents,
    close: async ({ spreadMs }: { spreadMs: number } = { spreadMs: 0 }) => {
      state.draining = true;
      clearInterval(saturationTick);
      const sockets = [...io.sockets.sockets.values()];
      await Promise.all(
        sockets.map(async (socket, index) => {
          const batch = Math.floor((index * SHUTDOWN_BATCHES) / sockets.length);
          await sleep((batch * spreadMs) / SHUTDOWN_BATCHES);
          socket.conn.close();
        }),
      );
      engine.close();
      server.close();
      await once(server, "close");
    },
  };
};
