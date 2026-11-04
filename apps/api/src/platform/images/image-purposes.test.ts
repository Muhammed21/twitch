import { describe, expect, it } from "vitest";

import { IMAGE_PURPOSES, MAX_INPUT_PIXELS } from "./image-purposes.ts";

const TEN_MIB = 10 * 1024 * 1024;

describe("usages d'une image envoyée (ADR 0044)", () => {
  it("fixe le poids, les dimensions minimales et la sortie de chaque usage", () => {
    expect(IMAGE_PURPOSES).toEqual({
      avatar: {
        maxBytes: TEN_MIB,
        minWidth: 256,
        minHeight: 256,
        outputWidth: 512,
        outputHeight: 512,
      },
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
    });
  });

  it("plafonne les pixels décodés à 40 millions", () => {
    expect(MAX_INPUT_PIXELS).toBe(40_000_000);
  });
});
