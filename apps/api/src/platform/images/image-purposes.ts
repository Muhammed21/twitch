export const IMAGE_PURPOSE_NAMES = ["avatar", "banner", "category"] as const;

export type ImagePurpose = (typeof IMAGE_PURPOSE_NAMES)[number];

export type ImagePurposeSpec = {
  readonly maxBytes: number;
  readonly minWidth: number;
  readonly minHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
};

const TEN_MIB = 10 * 1024 * 1024;

export const MAX_INPUT_PIXELS = 40_000_000;

export const IMAGE_PURPOSES: Readonly<Record<ImagePurpose, ImagePurposeSpec>> = {
  avatar: { maxBytes: TEN_MIB, minWidth: 256, minHeight: 256, outputWidth: 512, outputHeight: 512 },
  banner: {
    maxBytes: TEN_MIB,
    minWidth: 1200,
    minHeight: 480,
    outputWidth: 1920,
    outputHeight: 768,
  },
  category: {
    maxBytes: TEN_MIB,
    minWidth: 285,
    minHeight: 380,
    outputWidth: 570,
    outputHeight: 760,
  },
};
