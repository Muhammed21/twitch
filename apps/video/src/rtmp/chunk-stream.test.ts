import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type ChunkLimits, demuxChunks, type RtmpMessage, startDemuxer } from "./chunk-stream.ts";
import {
  concatBytes,
  FFMPEG_PUBLISH_CHUNKS,
  FFMPEG_PUBLISH_FLV_TAGS,
  makeChunk,
} from "./testing/rtmp-fixtures.ts";

const LIMITS: ChunkLimits = { maxChunkSize: 65_536, maxMessageSize: 1 << 20, maxChunkStreams: 8 };

const AUDIO = 8;
const VIDEO = 9;
const SET_CHUNK_SIZE = 1;
const COMMAND = 20;

const bytes = (size: number, fill = 1) => new Uint8Array(size).fill(fill);

const demuxAll = (pieces: readonly Uint8Array[], limits: ChunkLimits = LIMITS) =>
  pieces.reduce<{
    demuxer: ReturnType<typeof startDemuxer>;
    buffered: Uint8Array;
    messages: readonly RtmpMessage[];
  }>(
    (state, piece) => {
      const input = concatBytes(state.buffered, piece);
      const step = demuxChunks({ demuxer: state.demuxer, input });
      if (!step.ok) {
        throw new Error(step.error);
      }
      return {
        demuxer: step.value.demuxer,
        buffered: input.subarray(step.value.consumed),
        messages: [...state.messages, ...step.value.messages],
      };
    },
    { demuxer: startDemuxer(limits), buffered: new Uint8Array(0), messages: [] },
  );

const demuxOnce = (input: Uint8Array, limits: ChunkLimits = LIMITS) =>
  demuxChunks({ demuxer: startDemuxer(limits), input });

const fingerprint = (messages: readonly RtmpMessage[]) =>
  messages.map(({ payload, ...header }) => ({
    ...header,
    payload: Buffer.from(payload).toString("base64"),
  }));

const mediaOf = (messages: readonly RtmpMessage[]) =>
  messages
    .filter(({ typeId }) => typeId === AUDIO || typeId === VIDEO)
    .map(({ typeId, timestamp, payload }) => ({ typeId, timestamp, payload }));

const splitAt = (input: Uint8Array, cuts: readonly number[]): readonly Uint8Array[] => {
  const bounds = [...new Set([0, ...cuts.map((cut) => cut % input.length), input.length])].toSorted(
    (left, right) => left - right,
  );
  return bounds.slice(1).map((end, index) => input.subarray(bounds[index], end));
};

describe("démultiplexage des chunks RTMP, rejoué depuis une publication ffmpeg", () => {
  it("rend les messages audio et vidéo identiques aux tags du FLV écrit par le même ffmpeg", () => {
    const { messages, buffered } = demuxAll([FFMPEG_PUBLISH_CHUNKS]);

    expect(mediaOf(messages)).toEqual(
      FFMPEG_PUBLISH_FLV_TAGS.filter(({ typeId }) => typeId === AUDIO || typeId === VIDEO),
    );
    expect(buffered).toHaveLength(0);
  });

  it("commence par la commande connect, en chunks de 128 octets", () => {
    const [connect] = demuxAll([FFMPEG_PUBLISH_CHUNKS]).messages;

    expect(connect).toMatchObject({ chunkStreamId: 3, typeId: COMMAND, streamId: 0, timestamp: 0 });
    expect(connect?.payload.length).toBeGreaterThan(128);
    expect(
      Buffer.from(connect?.payload ?? [])
        .subarray(3, 10)
        .toString(),
    ).toBe("connect");
  });

  it("rend les mêmes messages quel que soit le découpage des octets reçus", () => {
    const expected = demuxAll([FFMPEG_PUBLISH_CHUNKS]).messages;
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 20 }), (cuts) => {
        expect(fingerprint(demuxAll(splitAt(FFMPEG_PUBLISH_CHUNKS, cuts)).messages)).toEqual(
          fingerprint(expected),
        );
      }),
      { numRuns: 30 },
    );
  });
});

describe("en-têtes de chunk", () => {
  it("lit un message de format 0 et attend un chunk incomplet sans le consommer", () => {
    const chunk = makeChunk({
      fmt: 0,
      chunkStreamId: 4,
      timestamp: 40,
      length: 3,
      typeId: AUDIO,
      streamId: 1,
      data: bytes(3),
    });

    expect(demuxOnce(concatBytes(chunk, chunk.subarray(0, 13)))).toEqual({
      ok: true,
      value: {
        demuxer: expect.anything(),
        consumed: chunk.length,
        messages: [
          { chunkStreamId: 4, typeId: AUDIO, streamId: 1, timestamp: 40, payload: bytes(3) },
        ],
      },
    });
  });

  it("applique les deltas des formats 1, 2 et 3, puis repart de l'horodatage absolu d'un format 0", () => {
    const { messages } = demuxAll([
      concatBytes(
        makeChunk({
          fmt: 0,
          chunkStreamId: 6,
          timestamp: 1000,
          length: 2,
          typeId: VIDEO,
          streamId: 1,
          data: bytes(2),
        }),
        makeChunk({
          fmt: 1,
          chunkStreamId: 6,
          timestamp: 33,
          length: 1,
          typeId: AUDIO,
          data: bytes(1, 2),
        }),
        makeChunk({ fmt: 2, chunkStreamId: 6, timestamp: 10, data: bytes(1, 3) }),
        makeChunk({ fmt: 3, chunkStreamId: 6, data: bytes(1, 4) }),
        makeChunk({ fmt: 3, chunkStreamId: 6, data: bytes(1, 5) }),
        makeChunk({
          fmt: 0,
          chunkStreamId: 6,
          timestamp: 5,
          length: 1,
          typeId: AUDIO,
          streamId: 1,
          data: bytes(1, 6),
        }),
      ),
    ]);

    expect(
      messages.map(({ typeId, timestamp, streamId, payload }) => ({
        typeId,
        timestamp,
        streamId,
        payload,
      })),
    ).toEqual([
      { typeId: VIDEO, timestamp: 1000, streamId: 1, payload: bytes(2) },
      { typeId: AUDIO, timestamp: 1033, streamId: 1, payload: bytes(1, 2) },
      { typeId: AUDIO, timestamp: 1043, streamId: 1, payload: bytes(1, 3) },
      { typeId: AUDIO, timestamp: 1053, streamId: 1, payload: bytes(1, 4) },
      { typeId: AUDIO, timestamp: 1063, streamId: 1, payload: bytes(1, 5) },
      { typeId: AUDIO, timestamp: 5, streamId: 1, payload: bytes(1, 6) },
    ]);
  });

  it("attend la suite d'un en-tête de base coupé", () => {
    expect(demuxOnce(Uint8Array.of(0x00))).toMatchObject({ ok: true, value: { consumed: 0 } });
    expect(demuxOnce(Uint8Array.of(0x01, 0x00))).toMatchObject({
      ok: true,
      value: { consumed: 0 },
    });
  });

  it("abandonne le message en cours d'un flux qui reçoit un nouvel en-tête complet", () => {
    const { messages } = demuxAll([
      concatBytes(
        makeChunk({ fmt: 0, chunkStreamId: 6, length: 200, typeId: VIDEO, data: bytes(128, 1) }),
        makeChunk({ fmt: 0, chunkStreamId: 6, length: 2, typeId: AUDIO, data: bytes(2, 2) }),
      ),
    ]);

    expect(messages).toMatchObject([{ typeId: AUDIO, payload: bytes(2, 2) }]);
  });

  it("lit un message vide, même porté par un chunk d'un seul octet en fin d'entrée", () => {
    const input = concatBytes(
      makeChunk({ fmt: 0, chunkStreamId: 6, length: 0, typeId: AUDIO, streamId: 1 }),
      makeChunk({ fmt: 3, chunkStreamId: 6 }),
    );

    expect(demuxOnce(input)).toMatchObject({
      ok: true,
      value: { consumed: input.length, messages: [{ payload: bytes(0) }, { payload: bytes(0) }] },
    });
  });

  it.each([
    ["sur 2 octets", 64],
    ["sur 2 octets, au plus haut", 319],
    ["sur 3 octets", 320],
    ["sur 3 octets, au plus haut", 65_599],
  ])("lit un identifiant de flux de chunks %s (%i)", (_, chunkStreamId) => {
    const chunk = makeChunk({ fmt: 0, chunkStreamId, length: 1, typeId: AUDIO, data: bytes(1) });

    expect(demuxAll([chunk]).messages).toMatchObject([{ chunkStreamId }]);
  });

  it("lit l'horodatage étendu, répété sur les chunks de format 3 du même message", () => {
    const timestamp = 0x1_00_00_00 + 5;
    const { messages, buffered } = demuxAll([
      concatBytes(
        makeChunk({
          fmt: 0,
          chunkStreamId: 4,
          timestamp,
          length: 129,
          typeId: VIDEO,
          data: bytes(128),
        }),
        makeChunk({ fmt: 3, chunkStreamId: 4, timestamp, data: bytes(1) }),
      ),
    ]);

    expect(messages).toMatchObject([{ timestamp, payload: bytes(129) }]);
    expect(buffered).toHaveLength(0);
  });

  it("attend l'horodatage étendu d'un en-tête coupé avant lui", () => {
    const chunk = makeChunk({
      fmt: 0,
      chunkStreamId: 4,
      timestamp: 0x1_00_00_00,
      length: 1,
      typeId: VIDEO,
      data: bytes(1),
    });

    expect(demuxOnce(chunk.subarray(0, 14))).toMatchObject({
      ok: true,
      value: { consumed: 0, messages: [] },
    });
    expect(demuxOnce(chunk)).toMatchObject({ ok: true, value: { consumed: chunk.length } });
  });

  it("réassemble des messages entrelacés sur plusieurs flux de chunks", () => {
    const { messages } = demuxAll([
      concatBytes(
        makeChunk({ fmt: 0, chunkStreamId: 4, length: 200, typeId: AUDIO, data: bytes(128, 4) }),
        makeChunk({ fmt: 0, chunkStreamId: 6, length: 130, typeId: VIDEO, data: bytes(128, 6) }),
        makeChunk({ fmt: 3, chunkStreamId: 4, data: bytes(72, 4) }),
        makeChunk({ fmt: 3, chunkStreamId: 6, data: bytes(2, 6) }),
      ),
    ]);

    expect(messages.map(({ chunkStreamId, payload }) => ({ chunkStreamId, payload }))).toEqual([
      { chunkStreamId: 4, payload: bytes(200, 4) },
      { chunkStreamId: 6, payload: bytes(130, 6) },
    ]);
  });

  it("applique la taille de chunk annoncée aux chunks qui suivent", () => {
    const setChunkSize = new Uint8Array(Buffer.from([0, 0, 1, 0]));
    const { messages } = demuxAll([
      concatBytes(
        makeChunk({
          fmt: 0,
          chunkStreamId: 2,
          length: 4,
          typeId: SET_CHUNK_SIZE,
          data: setChunkSize,
        }),
        makeChunk({ fmt: 0, chunkStreamId: 4, length: 256, typeId: VIDEO, data: bytes(256) }),
      ),
    ]);

    expect(messages.map(({ typeId, payload }) => ({ typeId, size: payload.length }))).toEqual([
      { typeId: SET_CHUNK_SIZE, size: 4 },
      { typeId: VIDEO, size: 256 },
    ]);
  });
});

describe("plafonds du démultiplexeur (ADR 0031, §3)", () => {
  it("refuse un message plus grand que le plafond dès son en-tête", () => {
    const header = makeChunk({ fmt: 0, chunkStreamId: 4, length: 1001, typeId: VIDEO });

    expect(demuxOnce(header, { ...LIMITS, maxMessageSize: 1000 })).toEqual({
      ok: false,
      error: "message_too_large",
    });
    expect(
      demuxOnce(makeChunk({ fmt: 0, chunkStreamId: 4, length: 1000, typeId: VIDEO }), {
        ...LIMITS,
        maxMessageSize: 1000,
      }).ok,
    ).toBe(true);
  });

  it.each([
    ["nulle", [0, 0, 0, 0]],
    ["sous les 128 octets du départ", [0, 0, 0, 127]],
    ["au-delà du plafond", [0, 1, 0, 1]],
  ])("refuse une taille de chunk %s", (_, value) => {
    const chunk = makeChunk({
      fmt: 0,
      chunkStreamId: 2,
      length: 4,
      typeId: SET_CHUNK_SIZE,
      data: Uint8Array.from(value),
    });

    expect(demuxOnce(chunk)).toEqual({ ok: false, error: "invalid_chunk_size" });
  });

  it.each([
    ["plafond, en ignorant le bit de poids fort", [0x80, 1, 0, 0]],
    ["de 128 octets", [0, 0, 0, 128]],
  ])("accepte une taille de chunk %s", (_, value) => {
    const chunk = makeChunk({
      fmt: 0,
      chunkStreamId: 2,
      length: 4,
      typeId: SET_CHUNK_SIZE,
      data: Uint8Array.from(value),
    });

    expect(demuxOnce(chunk).ok).toBe(true);
  });

  it("réassemble en temps linéaire un message de 2 Mio en chunks de 128 octets", () => {
    const length = 2 * 1024 * 1024;
    const data = bytes(128, 9);
    const continuation = makeChunk({ fmt: 3, chunkStreamId: 6, data });
    const input = concatBytes(
      makeChunk({ fmt: 0, chunkStreamId: 6, length, typeId: VIDEO, data }),
      ...Array.from<Uint8Array>({ length: length / 128 - 1 }).fill(continuation),
    );
    const startedAt = performance.now();

    const step = demuxOnce(input, { ...LIMITS, maxMessageSize: length });

    expect(performance.now() - startedAt).toBeLessThan(500);
    const [message] = step.ok ? step.value.messages : [];
    expect(Buffer.from(message?.payload ?? []).equals(Buffer.alloc(length, 9))).toBe(true);
  });

  it("ne réserve pour un message que le double des octets reçus, pas la taille annoncée", () => {
    const announced = 2 * 1024 * 1024;
    const input = concatBytes(
      ...Array.from({ length: 16 }, (_, index) =>
        makeChunk({
          fmt: 0,
          chunkStreamId: 4 + index,
          length: announced,
          typeId: VIDEO,
          data: bytes(128),
        }),
      ),
    );

    const step = demuxOnce(input, { ...LIMITS, maxMessageSize: announced, maxChunkStreams: 16 });

    const reserved = step.ok
      ? [...step.value.demuxer.streams.values()].reduce(
          (total, { payload }) => total + payload.byteLength,
          0,
        )
      : Number.NaN;
    expect(reserved).toBeLessThanOrEqual(16 * 2 * 128);
  });

  it("refuse un flux de chunks de trop, mais réutilise un flux déjà ouvert", () => {
    const chunks = [4, 5, 6].map((chunkStreamId) =>
      makeChunk({ fmt: 0, chunkStreamId, length: 1, typeId: AUDIO, data: bytes(1) }),
    );

    const [first, second] = chunks;
    expect(
      demuxOnce(concatBytes(...chunks.slice(0, 2), first ?? bytes(0), second ?? bytes(0)), {
        ...LIMITS,
        maxChunkStreams: 2,
      }).ok,
    ).toBe(true);
    expect(demuxOnce(concatBytes(...chunks), { ...LIMITS, maxChunkStreams: 2 })).toEqual({
      ok: false,
      error: "too_many_chunk_streams",
    });
  });

  it.each([1, 2, 3] as const)(
    "refuse un chunk de format %i sur un flux de chunks jamais ouvert",
    (fmt) => {
      expect(demuxOnce(makeChunk({ fmt, chunkStreamId: 4, length: 1, data: bytes(1) }))).toEqual({
        ok: false,
        error: "unknown_chunk_stream",
      });
    },
  );

  it("ne plante sur aucune entrée, ne consomme jamais plus que reçu et ne rend aucun message au-delà du plafond", () => {
    const limits = { maxChunkSize: 4096, maxMessageSize: 2048, maxChunkStreams: 4 };
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4000 }), (input) => {
        const step = demuxOnce(input, limits);

        expect(!step.ok || step.value.consumed <= input.length).toBe(true);
        expect(!step.ok || step.value.messages.every(({ payload }) => payload.length <= 2048)).toBe(
          true,
        );
      }),
      { numRuns: 500 },
    );
  });
});
