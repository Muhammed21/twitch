import { once } from "node:events";
import { createServer, type Socket } from "node:net";

import { z } from "zod";

import { err, ok } from "@repo/result";

import { muxMessages } from "./chunk-mux.ts";
import {
  type ChunkLimits,
  type ChunkRefusal,
  type Demuxer,
  demuxChunks,
  type RtmpMessage,
  startDemuxer,
} from "./chunk-stream.ts";
import {
  type Command,
  connectAccepted,
  publishStarted,
  readCommand,
  streamCreated,
} from "./commands.ts";
import { advanceHandshake, type Handshake, startHandshake } from "./handshake.ts";

const COMMAND = 20;

const BoundAddress = z.object({ port: z.int() });

export type RtmpRejection =
  | "unsupported_version"
  | "handshake_timeout"
  | "idle_timeout"
  | ChunkRefusal
  | "malformed_command"
  | "publish_refused"
  | "publish_failed";

export type Publication = {
  readonly receive?: (message: RtmpMessage) => void;
  readonly end: () => Promise<void>;
};

export type PublicationControls = { readonly close: () => void };

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
  limits,
  randomBytes,
  onMessage,
  publish,
  onError,
}: {
  port: number;
  handshakeTimeoutMs: number;
  idleTimeoutMs: number;
  limits: ChunkLimits;
  randomBytes: (size: number) => Uint8Array;
  onMessage: (message: RtmpMessage) => void;
  publish: (streamKey: string, controls: PublicationControls) => Promise<Publication | undefined>;
  onError: (error: unknown) => void;
}): Promise<RtmpServer> => {
  const sockets = new Set<Socket>();
  const endings = new Set<Promise<unknown>>();
  const counters = {
    handshakes: 0,
    rejections: {
      unsupported_version: 0,
      handshake_timeout: 0,
      idle_timeout: 0,
      unknown_chunk_stream: 0,
      message_too_large: 0,
      invalid_chunk_size: 0,
      too_many_chunk_streams: 0,
      malformed_command: 0,
      publish_refused: 0,
      publish_failed: 0,
    },
  };

  const reject = (socket: Socket, reason: RtmpRejection) => {
    counters.rejections[reason] += 1;
    socket.destroy();
  };

  const endQuietly = (publication: Publication | undefined) => publication?.end().catch(onError);

  const accept = (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", ignoreSocketError);
    const deadline = setTimeout(() => reject(socket, "handshake_timeout"), handshakeTimeoutMs);
    socket.on("close", () => clearTimeout(deadline));
    const connection: {
      handshake: Handshake;
      demuxer: Demuxer;
      buffered: Uint8Array;
      publication: Publication | undefined;
      work: Promise<unknown>;
    } = {
      handshake: startHandshake(),
      demuxer: startDemuxer(limits),
      buffered: new Uint8Array(0),
      publication: undefined,
      work: Promise.resolve(),
    };
    const send = (messages: readonly RtmpMessage[]) => socket.write(muxMessages(messages));

    const startPublication = async ({
      streamKey,
      streamId,
    }: {
      streamKey: string;
      streamId: number;
    }) => {
      if (connection.publication !== undefined) {
        reject(socket, "publish_refused");
        return;
      }
      socket.pause();
      const asked = await publish(streamKey, { close: () => socket.destroy() }).then(
        (publication) => ok(publication),
        (error: unknown) => err(error),
      );
      socket.resume();
      if (!asked.ok) {
        onError(asked.error);
        reject(socket, "publish_failed");
        return;
      }
      if (asked.value === undefined) {
        reject(socket, "publish_refused");
        return;
      }
      connection.publication = asked.value;
      send([publishStarted(streamId)]);
    };

    const obey = async (command: Command) => {
      if (command.name === "connect") {
        send(connectAccepted(command.transactionId));
      }
      if (command.name === "createStream") {
        send([streamCreated(command.transactionId)]);
      }
      if (command.name === "publish") {
        await startPublication(command);
      }
      if (command.name === "deleteStream") {
        const ended = connection.publication;
        connection.publication = undefined;
        await endQuietly(ended);
      }
    };

    const handle = async (message: RtmpMessage) => {
      if (socket.destroyed) {
        return;
      }
      onMessage(message);
      if (message.typeId !== COMMAND) {
        connection.publication?.receive?.(message);
        return;
      }
      const command = readCommand(message);
      if (!command.ok) {
        reject(socket, command.error);
        return;
      }
      await obey(command.value);
    };

    socket.on("close", () => {
      const ending = connection.work.then(() => endQuietly(connection.publication));
      endings.add(ending);
      void ending.then(() => endings.delete(ending));
    });

    const demux = (input: Uint8Array) => {
      const step = demuxChunks({ demuxer: connection.demuxer, input });
      if (!step.ok) {
        reject(socket, step.error);
        return;
      }
      connection.demuxer = step.value.demuxer;
      connection.buffered = input.subarray(step.value.consumed);
      step.value.messages.forEach((message) => {
        connection.work = connection.work.then(() => handle(message));
      });
    };

    const shake = (input: Uint8Array) => {
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
        socket.setTimeout(idleTimeoutMs, () => reject(socket, "idle_timeout"));
        demux(connection.buffered);
      }
    };

    socket.on("data", (chunk: Buffer) => {
      const input = joined(connection.buffered, chunk);
      if (connection.handshake.phase === "done") {
        demux(input);
        return;
      }
      shake(input);
    });
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
      const closed = [
        server.listening ? once(server, "close") : Promise.resolve(),
        ...[...sockets].map((socket) => once(socket, "close")),
      ];
      server.close();
      sockets.forEach((socket) => socket.destroy());
      await Promise.all(closed);
      await Promise.all(endings);
    },
  };
};
