import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Amf0Value, decodeAmf0, encodeAmf0 } from "./amf0.ts";
import { ffmpegMessage } from "./testing/rtmp-fixtures.ts";

const amf0Value: fc.Arbitrary<Amf0Value> = fc.letrec<{ value: Amf0Value }>((tie) => ({
  value: fc.oneof(
    { depthSize: "small" },
    fc.double({ noNaN: true }),
    fc.boolean(),
    fc.string({ unit: "binary", maxLength: 40 }),
    fc.constant(null),
    fc.constant(undefined),
    fc.dictionary(fc.string({ unit: "binary", maxLength: 10 }), tie("value"), { maxKeys: 4 }),
  ),
})).value;

const nested = (depth: number): Amf0Value => (depth === 0 ? "fond" : { inner: nested(depth - 1) });

describe("AMF0", () => {
  it("décode la commande connect envoyée par ffmpeg", () => {
    expect(decodeAmf0(ffmpegMessage("connect").payload)).toEqual({
      ok: true,
      value: [
        "connect",
        1,
        {
          app: "live",
          type: "nonprivate",
          flashVer: "FMLE/3.0 (compatible; Lavf63.1.101)",
          tcUrl: "rtmp://127.0.0.1:19351/live",
        },
      ],
    });
  });

  it("relit à l'identique toute suite de valeurs qu'il encode", () => {
    fc.assert(
      fc.property(fc.array(amf0Value, { maxLength: 5 }), (values) => {
        expect(decodeAmf0(encodeAmf0(values))).toEqual({ ok: true, value: values });
      }),
    );
  });

  it("refuse une valeur coupée, quel que soit l'endroit de la coupure", () => {
    const encoded = encodeAmf0([{ code: "NetStream.Publish.Start", level: 1.5, ok: true }]);

    const cuts = Array.from({ length: encoded.length - 1 }, (_, index) => index + 1);

    expect(
      cuts.filter((cut) => decodeAmf0(encoded.subarray(0, cut)).ok).map((cut) => encoded[cut - 1]),
    ).toEqual([]);
  });

  it.each([
    ["un marqueur inconnu", [0x0c]],
    ["un booléen sans valeur", [0x01]],
    ["une longueur de chaîne d'un seul octet", [0x02, 0]],
    ["une clé d'objet suivie d'une fin d'objet", [0x03, 0, 1, 0x61, 0x09]],
  ])("refuse %s", (_, bytes) => {
    expect(decodeAmf0(Uint8Array.from(bytes))).toEqual({ ok: false, error: "malformed_amf0" });
  });

  it("accepte 32 objets imbriqués et refuse le 33ᵉ", () => {
    expect(decodeAmf0(encodeAmf0([nested(32)])).ok).toBe(true);
    expect(decodeAmf0(encodeAmf0([nested(33)]))).toEqual({ ok: false, error: "malformed_amf0" });
  });

  it("ne plante sur aucune suite d'octets", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 64 }), (bytes) => {
        expect(typeof decodeAmf0(bytes).ok).toBe("boolean");
      }),
    );
  });
});
