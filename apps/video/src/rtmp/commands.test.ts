import { describe, expect, it } from "vitest";

import { type Amf0Value, decodeAmf0, encodeAmf0 } from "./amf0.ts";
import type { RtmpMessage } from "./chunk-stream.ts";
import { connectAccepted, publishStarted, readCommand, streamCreated } from "./commands.ts";
import { FFMPEG_STREAM_KEY, ffmpegMessage } from "./testing/rtmp-fixtures.ts";

const makeCommand = (values: readonly Amf0Value[], streamId = 0): RtmpMessage => ({
  chunkStreamId: 3,
  typeId: 20,
  streamId,
  timestamp: 0,
  payload: encodeAmf0(values),
});

const valuesOf = ({ payload }: RtmpMessage) => {
  const values = decodeAmf0(payload);
  return values.ok ? values.value : [];
};

describe("commandes RTMP d'une publication", () => {
  it("lit les commandes de ffmpeg : connect, createStream, publish avec sa clé, deleteStream", () => {
    expect(
      ["connect", "createStream", "publish", "deleteStream"].map((name) =>
        readCommand(ffmpegMessage(name)),
      ),
    ).toEqual([
      { ok: true, value: { name: "connect", transactionId: 1 } },
      { ok: true, value: { name: "createStream", transactionId: 4 } },
      { ok: true, value: { name: "publish", streamKey: FFMPEG_STREAM_KEY, streamId: 1 } },
      { ok: true, value: { name: "deleteStream" } },
    ]);
  });

  it("accepte sans y répondre les commandes qui n'engagent rien, comme releaseStream et FCPublish", () => {
    expect(
      ["releaseStream", "FCPublish", "FCUnpublish"].map((name) => readCommand(ffmpegMessage(name))),
    ).toEqual(Array.from({ length: 3 }, () => ({ ok: true, value: { name: "other" } })));
  });

  it.each<readonly Amf0Value[]>([
    [],
    [1, "connect"],
    ["connect"],
    ["createStream", "4"],
    ["publish", 5, null],
    ["publish", 5, null, ""],
    ["publish", 5, null, 42],
  ])("refuse une commande mal formée : %j", (...values) => {
    expect(readCommand(makeCommand(values))).toEqual({ ok: false, error: "malformed_command" });
  });

  it("refuse une commande dont l'AMF0 ne se décode pas", () => {
    expect(
      readCommand({ ...makeCommand(["connect", 1]), payload: Uint8Array.of(0x02, 0, 9) }),
    ).toEqual({ ok: false, error: "malformed_command" });
  });

  it("répond à connect : taille de fenêtre, bande passante, puis _result de succès", () => {
    const [windowSize, bandwidth, result] = connectAccepted(3);

    expect(windowSize).toMatchObject({ chunkStreamId: 2, typeId: 5, streamId: 0 });
    expect(Buffer.from(windowSize?.payload ?? [])).toEqual(Buffer.from([0, 0x26, 0x25, 0xa0]));
    expect(bandwidth).toMatchObject({ chunkStreamId: 2, typeId: 6, streamId: 0 });
    expect(Buffer.from(bandwidth?.payload ?? [])).toEqual(Buffer.from([0, 0x26, 0x25, 0xa0, 2]));
    expect(result).toMatchObject({ chunkStreamId: 3, typeId: 20, streamId: 0 });
    expect(valuesOf(result ?? makeCommand([]))).toEqual([
      "_result",
      3,
      { fmsVer: "FMS/3,0,1,123", capabilities: 31 },
      {
        level: "status",
        code: "NetConnection.Connect.Success",
        description: "Connexion acceptée.",
        objectEncoding: 0,
      },
    ]);
  });

  it("répond à createStream par le flux de message 1", () => {
    const reply = streamCreated(4);

    expect(reply).toMatchObject({ chunkStreamId: 3, typeId: 20, streamId: 0 });
    expect(valuesOf(reply)).toEqual(["_result", 4, null, 1]);
  });

  it("annonce le début de la publication sur le flux de message publié", () => {
    const reply = publishStarted(1);

    expect(reply).toMatchObject({ chunkStreamId: 3, typeId: 20, streamId: 1 });
    expect(valuesOf(reply)).toEqual([
      "onStatus",
      0,
      null,
      {
        level: "status",
        code: "NetStream.Publish.Start",
        description: "Publication démarrée.",
      },
    ]);
  });
});
