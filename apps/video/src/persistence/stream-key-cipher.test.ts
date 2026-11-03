import { createHmac, hkdfSync, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { streamKeyCipher } from "./stream-key-cipher.ts";

const STREAM_KEY = `sk_live_${"ab".repeat(32)}`;

const makeCipher = () => streamKeyCipher({ key: randomBytes(32) });

describe("chiffrement des clés de stream (AES-256-GCM)", () => {
  it("rend la clé qu'il a chiffrée, avec la version 1 de la clé de chiffrement", () => {
    const cipher = makeCipher();

    const encrypted = cipher.encrypt(STREAM_KEY);

    expect(encrypted.encryptionKeyVersion).toBe(1);
    expect(cipher.decrypt(encrypted)).toBe(STREAM_KEY);
  });

  it("chiffre deux fois la même clé en deux résultats différents, sans la laisser lisible", () => {
    const cipher = makeCipher();

    const first = cipher.encrypt(STREAM_KEY);
    const second = cipher.encrypt(STREAM_KEY);

    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(Buffer.from(first.iv).equals(Buffer.from(second.iv))).toBe(false);
    expect(Buffer.from(first.ciphertext).toString("utf8")).not.toContain("sk_live_");
    expect(first.iv).toHaveLength(12);
    expect(first.authTag).toHaveLength(16);
  });

  it("refuse de déchiffrer avec une autre clé de chiffrement", () => {
    const encrypted = makeCipher().encrypt(STREAM_KEY);

    const failure = (() => {
      try {
        return makeCipher().decrypt(encrypted);
      } catch (error) {
        return error;
      }
    })();

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      message: expect.stringMatching(/clé de stream illisible/),
      cause: expect.any(Error),
    });
  });

  it("refuse une clé chiffrée dont un octet a changé", () => {
    const cipher = makeCipher();
    const encrypted = cipher.encrypt(STREAM_KEY);
    const tampered = Uint8Array.from(encrypted.ciphertext);
    tampered[0] = (tampered[0] ?? 0) ^ 1;

    expect(() => cipher.decrypt({ ...encrypted, ciphertext: tampered })).toThrow(
      /clé de stream illisible/,
    );
  });

  it("refuse une clé chiffrée par une version de clé de chiffrement qu'il ne connaît pas", () => {
    const cipher = makeCipher();
    const encrypted = cipher.encrypt(STREAM_KEY);

    expect(() => cipher.decrypt({ ...encrypted, encryptionKeyVersion: 2 })).toThrow(
      /version de clé de chiffrement inconnue : 2/,
    );
  });
});

describe("empreinte des clés de stream (HMAC-SHA256)", () => {
  it("rend une empreinte stable de 32 octets, HMAC de la clé par une clé dérivée en HKDF", () => {
    const key = randomBytes(32);
    const derived = Buffer.from(
      hkdfSync("sha256", key, Buffer.alloc(0), "video:stream-key-fingerprint:v1", 32),
    );

    const fingerprint = streamKeyCipher({ key }).fingerprint(STREAM_KEY);

    expect(fingerprint).toHaveLength(32);
    expect(Buffer.from(fingerprint)).toEqual(
      createHmac("sha256", derived).update(STREAM_KEY).digest(),
    );
    expect(Buffer.from(fingerprint)).not.toEqual(
      createHmac("sha256", key).update(STREAM_KEY).digest(),
    );
  });

  it("distingue deux clés de stream, et deux clés de chiffrement", () => {
    const cipher = makeCipher();

    const fingerprints = [
      cipher.fingerprint(STREAM_KEY),
      cipher.fingerprint(`${STREAM_KEY.slice(0, -1)}c`),
      makeCipher().fingerprint(STREAM_KEY),
    ].map((fingerprint) => Buffer.from(fingerprint).toString("hex"));

    expect(new Set(fingerprints).size).toBe(3);
  });
});
