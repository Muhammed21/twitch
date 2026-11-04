export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

type Signature = { readonly offset: number; readonly bytes: readonly number[] };

const SIGNATURES: Readonly<Record<ImageType, readonly Signature[]>> = {
  "image/jpeg": [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  "image/png": [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  "image/webp": [
    { offset: 0, bytes: ascii("RIFF") },
    { offset: 8, bytes: ascii("WEBP") },
  ],
};

const matches = (image: Uint8Array, { offset, bytes }: Signature) =>
  bytes.every((byte, index) => image[offset + index] === byte);

export const sniffImageType = (image: Uint8Array): ImageType | undefined =>
  IMAGE_TYPES.find((type) => SIGNATURES[type].every((signature) => matches(image, signature)));
