import { z } from "zod";

import { err, ok, type Result } from "@repo/result";

import { type Amf0Value, decodeAmf0, encodeAmf0 } from "./amf0.ts";
import type { RtmpMessage } from "./chunk-stream.ts";

const PROTOCOL_CONTROL_CHUNK_STREAM = 2;
const COMMAND_CHUNK_STREAM = 3;
const WINDOW_ACKNOWLEDGEMENT_SIZE = 5;
const SET_PEER_BANDWIDTH = 6;
const COMMAND = 20;
const WINDOW_SIZE = 2_500_000;
const DYNAMIC_LIMIT = 2;
const PUBLISH_STREAM_ID = 1;

export type Command =
  | { readonly name: "connect"; readonly transactionId: number }
  | { readonly name: "createStream"; readonly transactionId: number }
  | { readonly name: "publish"; readonly streamKey: string; readonly streamId: number }
  | { readonly name: "deleteStream" }
  | { readonly name: "other" };

const Transaction = (name: "connect" | "createStream") =>
  z
    .tuple([z.literal(name), z.number()], z.unknown())
    .transform(([, transactionId]) => ({ name, transactionId }));

const CommandValues = z.union([
  Transaction("connect"),
  Transaction("createStream"),
  z
    .tuple([z.literal("publish"), z.number(), z.null(), z.string().min(1)], z.unknown())
    .transform(([, , , streamKey]) => ({ name: "publish" as const, streamKey })),
  z
    .tuple([z.literal("deleteStream")], z.unknown())
    .transform(() => ({ name: "deleteStream" as const })),
  z
    .tuple(
      [z.string().refine((name) => !["connect", "createStream", "publish"].includes(name))],
      z.unknown(),
    )
    .transform(() => ({ name: "other" as const })),
]);

export const readCommand = (message: RtmpMessage): Result<Command, "malformed_command"> => {
  const values = decodeAmf0(message.payload);
  const command = values.ok ? CommandValues.safeParse(values.value) : undefined;
  if (!command?.success) {
    return err("malformed_command");
  }
  return ok(
    command.data.name === "publish"
      ? { ...command.data, streamId: message.streamId }
      : command.data,
  );
};

const commandMessage = (streamId: number, values: readonly Amf0Value[]): RtmpMessage => ({
  chunkStreamId: COMMAND_CHUNK_STREAM,
  typeId: COMMAND,
  streamId,
  timestamp: 0,
  payload: encodeAmf0(values),
});

const controlMessage = (typeId: number, bytes: Buffer): RtmpMessage => ({
  chunkStreamId: PROTOCOL_CONTROL_CHUNK_STREAM,
  typeId,
  streamId: 0,
  timestamp: 0,
  payload: new Uint8Array(bytes),
});

const windowSize = (): Buffer => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(WINDOW_SIZE);
  return bytes;
};

export const connectAccepted = (transactionId: number): readonly RtmpMessage[] => [
  controlMessage(WINDOW_ACKNOWLEDGEMENT_SIZE, windowSize()),
  controlMessage(SET_PEER_BANDWIDTH, Buffer.concat([windowSize(), Buffer.of(DYNAMIC_LIMIT)])),
  commandMessage(0, [
    "_result",
    transactionId,
    { fmsVer: "FMS/3,0,1,123", capabilities: 31 },
    {
      level: "status",
      code: "NetConnection.Connect.Success",
      description: "Connexion acceptée.",
      objectEncoding: 0,
    },
  ]),
];

export const streamCreated = (transactionId: number): RtmpMessage =>
  commandMessage(0, ["_result", transactionId, null, PUBLISH_STREAM_ID]);

export const publishStarted = (streamId: number): RtmpMessage =>
  commandMessage(streamId, [
    "onStatus",
    0,
    null,
    { level: "status", code: "NetStream.Publish.Start", description: "Publication démarrée." },
  ]);
