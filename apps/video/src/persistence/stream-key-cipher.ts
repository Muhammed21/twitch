import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const ENCRYPTION_KEY_VERSION = 1;
const FINGERPRINT_KEY_INFO = "video:stream-key-fingerprint:v1";
const FINGERPRINT_KEY_BYTES = 32;

export type EncryptedStreamKey = {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
  readonly encryptionKeyVersion: number;
};

export type StreamKeyCipher = {
  readonly encrypt: (streamKey: string) => EncryptedStreamKey;
  readonly decrypt: (encrypted: EncryptedStreamKey) => string;
  readonly fingerprint: (streamKey: string) => Uint8Array<ArrayBuffer>;
};

const decipher = (key: Uint8Array, { ciphertext, iv, authTag }: EncryptedStreamKey): string => {
  try {
    const decipherer = createDecipheriv(ALGORITHM, key, iv).setAuthTag(authTag);
    return Buffer.concat([decipherer.update(ciphertext), decipherer.final()]).toString("utf8");
  } catch (error) {
    throw new Error("clé de stream illisible avec la clé de chiffrement courante", {
      cause: error,
    });
  }
};

export const streamKeyCipher = ({ key }: { key: Uint8Array }): StreamKeyCipher => {
  const fingerprintKey = Buffer.from(
    hkdfSync("sha256", key, Buffer.alloc(0), FINGERPRINT_KEY_INFO, FINGERPRINT_KEY_BYTES),
  );
  return {
    encrypt: (streamKey) => {
      const iv = randomBytes(IV_BYTES);
      const cipherer = createCipheriv(ALGORITHM, key, iv);
      const ciphertext = Buffer.concat([cipherer.update(streamKey), cipherer.final()]);
      return {
        ciphertext,
        iv,
        authTag: cipherer.getAuthTag(),
        encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
      };
    },
    decrypt: (encrypted) => {
      if (encrypted.encryptionKeyVersion !== ENCRYPTION_KEY_VERSION) {
        throw new Error(
          `version de clé de chiffrement inconnue : ${encrypted.encryptionKeyVersion}`,
        );
      }
      return decipher(key, encrypted);
    },
    fingerprint: (streamKey) =>
      new Uint8Array(createHmac("sha256", fingerprintKey).update(streamKey).digest()),
  };
};
