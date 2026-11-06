import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { IMAGE_PURPOSES } from "../platform/images/image-purposes.ts";

export const CAPTURES_DIRECTORY = new URL(
  "../../../../docs/reference-ui/parcourir/",
  import.meta.url,
);

export type BrowseCapture = "liste-categories--defaut.png" | "liste-categories--defile.png";

export type CaptureCover = {
  readonly kind: "capture";
  readonly capture: BrowseCapture;
  readonly column: 0 | 1 | 2;
  readonly top: number;
};

export type GeneratedCover = { readonly kind: "generated"; readonly hue: number };

export type CategoryCover = CaptureCover | (GeneratedCover & { readonly name: string });

const COLUMN_LEFTS = [48, 417, 786] as const;
const COVER_WIDTH = 345;
const COVER_HEIGHT = 460;

export const coverFrame = ({ column, top }: Pick<CaptureCover, "column" | "top">) => ({
  left: COLUMN_LEFTS[column],
  top,
  width: COVER_WIDTH,
  height: COVER_HEIGHT,
});

const LINKING_WORDS: ReadonlySet<string> = new Set(["and", "of", "the"]);

const monogramOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word) && !LINKING_WORDS.has(word.toLowerCase()))
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

export const generatedCoverSvg = ({ name, hue }: { name: string; hue: number }): string => {
  const { outputWidth: width, outputHeight: height } = IMAGE_PURPOSES.category;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 52%)"/>
      <stop offset="1" stop-color="hsl(${hue + 40} 65% 20%)"/>
    </linearGradient>
    <pattern id="rayures" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="12" height="36" fill="#ffffff" fill-opacity="0.07"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#fond)"/>
  <rect width="${width}" height="${height}" fill="url(#rayures)"/>
  <circle cx="${width * 0.82}" cy="${height * 0.18}" r="${width * 0.34}" fill="hsl(${hue + 180} 80% 70%)" fill-opacity="0.22"/>
  <circle cx="${width * 0.12}" cy="${height * 0.62}" r="${width * 0.22}" fill="#ffffff" fill-opacity="0.12"/>
  <text x="44" y="${height - 64}" font-family="Helvetica, Arial, sans-serif" font-weight="800" font-size="220" fill="#ffffff" fill-opacity="0.92">${monogramOf(name)}</text>
</svg>`;
};

export const renderCover = async (cover: CategoryCover): Promise<Uint8Array> => {
  const image =
    cover.kind === "capture"
      ? sharp(fileURLToPath(new URL(cover.capture, CAPTURES_DIRECTORY))).extract(coverFrame(cover))
      : sharp(Buffer.from(generatedCoverSvg(cover)));
  return new Uint8Array(await image.png().toBuffer());
};
