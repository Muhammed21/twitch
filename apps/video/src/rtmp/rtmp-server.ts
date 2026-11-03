import { once } from "node:events";
import { createServer, type Socket } from "node:net";

import { z } from "zod";

import { advanceHandshake, type Handshake, startHandshake } from "./handshake.ts";

const BoundAddress = z.object({ port: z.int() });

export type RtmpRejection = "unsupported_version" | "handshake_timeout" | "idle_timeout";

export type RtmpServerStats = {
  readonly connections: number;
  readonly handshakes: number;
  readonly rejections: Readonly<Record<RtmpRejection, number>>;
};

export type RtmpServer = {
  readonly port: number;
  readonly stats: () => RtmpServerStats;
  readonly close: () => Promise<void>;
};

const ignoreSocketError = (): undefined => undefined;

const joined = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(left.length + right.length);
  bytes.set(left);
  bytes.set(right, left.length);
  return bytes;
};

export const startRtmpServer = async ({
  port,
  handshakeTimeoutMs,
  idleTimeoutMs,
  randomBytes,
}: {
  port: number;
  handshakeTimeoutMs: number;
  idleTimeoutMs: number;
  randomBytes: (size: number) => Uint8Array;
}): Promise<RtmpServer> => {
  const sockets = new Set<Socket>();
  const counters = {
    handshakes: 0,
    rejections: { unsupported_version: 0, handshake_timeout: 0, idle_timeout: 0 },
  };

  const reject = (socket: Socket, reason: RtmpRejection) => {
    counters.rejections[reason] += 1;
    socket.destroy();
  };

  const accept = (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", ignoreSocketError);
    const deadline = setTimeout(() => reject(socket, "handshake_timeout"), handshakeTimeoutMs);
    socket.on("close", () => clearTimeout(deadline));
    const connection: { handshake: Handshake; buffered: Uint8Array } = {
      handshake: startHandshake(),
      buffered: new Uint8Array(0),
    };

    const onHandshakeData = (chunk: Buffer) => {
      const input = joined(connection.buffered, chunk);
      const step = advanceHandshake({ handshake: connection.handshake, input, randomBytes });
      if (!step.ok) {
        reject(socket, step.error);
        return;
      }
      socket.write(step.value.reply);
      connection.handshake = step.value.handshake;
      connection.buffered = input.subarray(step.value.consumed);
      if (step.value.handshake.phase === "done") {
        clearTimeout(deadline);
        counters.handshakes += 1;
        socket.off("data", onHandshakeData);
        socket.setTimeout(idleTimeoutMs, () => reject(socket, "idle_timeout"));
      }
    };
    socket.on("data", onHandshakeData);
  };

  const server = createServer(accept).listen(port);
  await once(server, "listening");

  return {
    port: BoundAddress.parse(server.address()).port,
    stats: () => ({
      connections: sockets.size,
      handshakes: counters.handshakes,
      rejections: { ...counters.rejections },
    }),
    close: async () => {
      const closed = server.listening ? once(server, "close") : Promise.resolve();
      server.close();
      sockets.forEach((socket) => socket.destroy());
      await closed;
    },
  };
};
