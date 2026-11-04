export type StoredObject =
  | { readonly kind: "missing" }
  | { readonly kind: "too_large" }
  | { readonly kind: "found"; readonly bytes: Uint8Array };

export interface ImageStorage {
  presignPut(request: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<string>;
  read(request: { key: string; maxBytes: number }): Promise<StoredObject>;
  write(request: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    cacheControl: string;
  }): Promise<void>;
  delete(key: string): Promise<void>;
}

export const incomingKey = ({
  userId,
  purpose,
  uploadId,
}: {
  userId: string;
  purpose: string;
  uploadId: string;
}): string => `incoming/${userId}/${purpose}/${uploadId}`;

export const servedKey = ({ purpose, imageId }: { purpose: string; imageId: string }): string =>
  `images/${purpose}/${imageId}.webp`;
