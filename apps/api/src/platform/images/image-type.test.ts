import { describe, expect, it } from "vitest";

import { sniffImageType } from "./image-type.ts";

const bytes = (...values: readonly number[]) => Uint8Array.from(values);

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00);
const WEBP = bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBPVP8 "));

describe("type réel d'une image, lu dans ses octets", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
  ])("reconnaît un %s", (_name, image, type) => {
    expect(sniffImageType(image)).toBe(type);
  });

  it("reconnaît un PNG réduit à sa signature", () => {
    expect(sniffImageType(PNG.subarray(0, 8))).toBe("image/png");
  });

  it.each([
    [
      "un fichier qui porte WEBP sans en-tête RIFF",
      bytes(...ascii("RIFX"), 0x24, 0x00, 0x00, 0x00, ...ascii("WEBP")),
    ],
    ["un SVG", bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg">'))],
    ["un GIF", bytes(...ascii("GIF89a"), 0x01, 0x00)],
    ["un HEIC", bytes(0x00, 0x00, 0x00, 0x18, ...ascii("ftypheic"))],
    [
      "un RIFF qui n'est pas du WebP",
      bytes(...ascii("RIFF"), 0x24, 0x00, 0x00, 0x00, ...ascii("WAVE")),
    ],
    ["un PNG tronqué", PNG.subarray(0, 7)],
    ["un JPEG tronqué", JPEG.subarray(0, 2)],
    ["un WebP tronqué", WEBP.subarray(0, 11)],
    ["un fichier vide", bytes()],
  ])("refuse %s", (_name, image) => {
    expect(sniffImageType(image)).toBeUndefined();
  });
});
