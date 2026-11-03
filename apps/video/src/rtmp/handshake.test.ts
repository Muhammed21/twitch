import { readFileSync } from "node:fs";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { advanceHandshake, type Handshake, startHandshake } from "./handshake.ts";

const FFMPEG_PUBLISH = new Uint8Array(
  readFileSync(new URL("./testing/ffmpeg-publish-handshake.bin", import.meta.url)),
);
const C0C1 = FFMPEG_PUBLISH.subarray(0, 1537);
const C1 = FFMPEG_PUBLISH.subarray(1, 1537);
const C2 = FFMPEG_PUBLISH.subarray(1537, 3073);
const AFTER_HANDSHAKE = FFMPEG_PUBLISH.subarray(3073);

const RECORDED_SERVER_RANDOM = Uint8Array.from({ length: 1528 }, (_, index) => (index + 8) % 251);
const recordedRandom = (size: number) => RECORDED_SERVER_RANDOM.subarray(0, size);

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const joined = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  parts.reduce((offset, part) => {
    joined.set(part, offset);
    return offset + part.length;
  }, 0);
  return joined;
};

const S0_S1_S2 = concat(Uint8Array.of(3), new Uint8Array(8), RECORDED_SERVER_RANDOM, C1);

const advance = (handshake: Handshake, input: Uint8Array) =>
  advanceHandshake({ handshake, input, randomBytes: recordedRandom });

type Replay = {
  readonly handshake: Handshake;
  readonly buffered: Uint8Array;
  readonly reply: Uint8Array;
};

const replay = (pieces: readonly Uint8Array[]) =>
  pieces.reduce<Replay>(
    (state, piece) => {
      const buffered = concat(state.buffered, piece);
      const step = advance(state.handshake, buffered);
      if (!step.ok) {
        throw new Error(step.error);
      }
      return {
        handshake: step.value.handshake,
        buffered: buffered.subarray(step.value.consumed),
        reply: concat(state.reply, step.value.reply),
      };
    },
    { handshake: startHandshake(), buffered: new Uint8Array(0), reply: new Uint8Array(0) },
  );

const splitAt = (bytes: Uint8Array, cuts: readonly number[]): readonly Uint8Array[] => {
  const bounds = [...new Set([0, ...cuts.map((cut) => cut % bytes.length), bytes.length])].toSorted(
    (left, right) => left - right,
  );
  return bounds.slice(1).map((end, index) => bytes.subarray(bounds[index], end));
};

describe("poignée de main RTMP, rejouée depuis une publication ffmpeg", () => {
  it("répond S0, S1 puis S2 en écho de C1, et attend C2", () => {
    const step = advance(startHandshake(), C0C1);

    expect(step).toEqual({
      ok: true,
      value: {
        handshake: { phase: "awaiting_c2" },
        consumed: 1537,
        reply: S0_S1_S2,
      },
    });
  });

  it("termine sur C2, que ffmpeg renvoie en écho de S1, et laisse les octets suivants aux chunks", () => {
    const step = advance({ phase: "awaiting_c2" }, concat(C2, AFTER_HANDSHAKE));

    expect(step).toEqual({
      ok: true,
      value: { handshake: { phase: "done" }, consumed: 1536, reply: new Uint8Array(0) },
    });
    expect(C2).toEqual(S0_S1_S2.subarray(1, 1537));
  });

  it("enchaîne C0, C1 et C2 arrivés d'un seul bloc", () => {
    const step = advance(startHandshake(), FFMPEG_PUBLISH);

    expect(step).toEqual({
      ok: true,
      value: { handshake: { phase: "done" }, consumed: 3073, reply: S0_S1_S2 },
    });
  });

  it("attend la suite sans rien consommer tant qu'un message est incomplet", () => {
    expect(advance(startHandshake(), new Uint8Array(0))).toEqual({
      ok: true,
      value: { handshake: { phase: "awaiting_c0c1" }, consumed: 0, reply: new Uint8Array(0) },
    });
    expect(advance(startHandshake(), C0C1.subarray(0, 1536))).toEqual({
      ok: true,
      value: { handshake: { phase: "awaiting_c0c1" }, consumed: 0, reply: new Uint8Array(0) },
    });
    expect(advance({ phase: "awaiting_c2" }, C2.subarray(0, 1535))).toEqual({
      ok: true,
      value: { handshake: { phase: "awaiting_c2" }, consumed: 0, reply: new Uint8Array(0) },
    });
  });

  it("termine sur C0, C1 et C2 exactement, sans octet de plus", () => {
    expect(advance(startHandshake(), FFMPEG_PUBLISH.subarray(0, 3073))).toEqual({
      ok: true,
      value: { handshake: { phase: "done" }, consumed: 3073, reply: S0_S1_S2 },
    });
    expect(advance({ phase: "awaiting_c2" }, C2)).toEqual({
      ok: true,
      value: { handshake: { phase: "done" }, consumed: 1536, reply: new Uint8Array(0) },
    });
  });

  it("tire exactement 1528 octets aléatoires pour S1", () => {
    const step = advanceHandshake({
      handshake: startHandshake(),
      input: C0C1,
      randomBytes: (size) => new Uint8Array(size).fill(size % 256),
    });

    expect(step.ok && step.value.reply.subarray(9, 1537)).toEqual(
      new Uint8Array(1528).fill(1528 % 256),
    );
  });

  it("ne consomme plus rien une fois terminée, même des octets qui ressemblent à C0 et C1", () => {
    expect(advance({ phase: "done" }, FFMPEG_PUBLISH)).toEqual({
      ok: true,
      value: { handshake: { phase: "done" }, consumed: 0, reply: new Uint8Array(0) },
    });
  });

  it.each([0, 2, 4, 6, 0xff])("refuse la version %i dès le premier octet", (version) => {
    expect(advance(startHandshake(), Uint8Array.of(version))).toEqual({
      ok: false,
      error: "unsupported_version",
    });
  });

  it("donne la même réponse quel que soit le découpage des octets reçus", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { maxLength: 8 }), (cuts) => {
        const result = replay(splitAt(FFMPEG_PUBLISH, cuts));

        expect(result.handshake).toEqual({ phase: "done" });
        expect(result.reply).toEqual(S0_S1_S2);
        expect(result.buffered).toEqual(AFTER_HANDSHAKE);
      }),
    );
  });

  it("ne plante sur aucune entrée et ne consomme jamais plus que reçu", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Handshake>(
          { phase: "awaiting_c0c1" },
          { phase: "awaiting_c2" },
          { phase: "done" },
        ),
        fc.uint8Array({ maxLength: 4000 }),
        (handshake, input) => {
          const step = advance(handshake, input);

          expect(!step.ok || step.value.consumed <= input.length).toBe(true);
        },
      ),
    );
  });
});
