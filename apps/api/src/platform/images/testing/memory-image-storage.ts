import type { ImageStorage } from "../image-storage.ts";

export type PresignedPut = {
  readonly key: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
};

export type WrittenObject = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly cacheControl: string;
};

export const memoryImageStorage = (initial: Readonly<Record<string, Uint8Array>> = {}) => {
  const deposits = new Map<string, Uint8Array>(Object.entries(initial));
  const written = new Map<string, WrittenObject>();
  const presigned: PresignedPut[] = [];
  const deleted: string[] = [];
  const storage: ImageStorage = {
    presignPut: async (request) => {
      presigned.push(request);
      return `https://s3.test/${request.key}?signature=1`;
    },
    read: async ({ key, maxBytes }) => {
      const bytes = deposits.get(key);
      if (bytes === undefined) {
        return { kind: "missing" };
      }
      return bytes.length > maxBytes ? { kind: "too_large" } : { kind: "found", bytes };
    },
    write: async ({ key, ...object }) => {
      written.set(key, object);
    },
    delete: async (key) => {
      deleted.push(key);
      deposits.delete(key);
    },
  };
  return { storage, presigned, written, deleted, deposits };
};
