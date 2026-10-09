import { describe, expect, it } from "vitest";

import type { DesignToken } from "../formats/swift.ts";
import { checkContrast, contrastRatio, parseContrastPairs, type ContrastPair } from "./contrast.ts";

const onBlack = (hex: string) => contrastRatio(hex, "#000000");

const colorToken = (path: string, value: string): DesignToken => ({
  path: path.split("."),
  $type: "color",
  value,
});

const pair = (overrides: Partial<ContrastPair> = {}): ContrastPair => ({
  foreground: "color.text.primary",
  background: "color.background.primary",
  min: 4.5,
  ...overrides,
});

const themes = ({
  light = [
    colorToken("color.text.primary", "#000000"),
    colorToken("color.background.primary", "#ffffff"),
  ],
  dark = [
    colorToken("color.text.primary", "#ffffff"),
    colorToken("color.background.primary", "#000000"),
  ],
}: {
  readonly light?: readonly DesignToken[];
  readonly dark?: readonly DesignToken[];
} = {}) => ({ light, dark });

describe("contrastRatio", () => {
  it("is 21:1 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 10);
  });

  it("is 1:1 for identical colours", () => {
    expect(contrastRatio("#5c16c5", "#5c16c5")).toBeCloseTo(1, 10);
  });

  it("matches the WCAG reference grey that just passes AA on white", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("does not depend on which colour is the foreground", () => {
    expect(contrastRatio("#ffffff", "#5c16c5")).toBeCloseTo(
      contrastRatio("#5c16c5", "#ffffff"),
      10,
    );
  });

  it("uses the linear segment of the sRGB curve for very dark channels", () => {
    expect(contrastRatio("#0a0a0a", "#000000")).toBeCloseTo(1.0607, 4);
  });

  it("weights the green channel most, then red, then blue", () => {
    expect(onBlack("#00ff00")).toBeCloseTo(15.3, 1);
    expect(onBlack("#ff0000")).toBeCloseTo(5.25, 2);
    expect(onBlack("#0000ff")).toBeCloseTo(2.44, 2);
  });

  it("names the foreground when it is not a 6- or 8-digit hex", () => {
    expect(() => contrastRatio("#fff", "#000000")).toThrow(
      "Foreground is not a 6- or 8-digit hex colour: #fff.",
    );
  });

  it("names the background when it is not a 6- or 8-digit hex", () => {
    expect(() => contrastRatio("#000000", "white")).toThrow(
      "Background is not a 6- or 8-digit hex colour: white.",
    );
  });

  it("ignores the case of hex digits", () => {
    expect(contrastRatio("#5C16C5", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#5c16c5", "#ffffff"),
      10,
    );
  });
});

describe("checkContrast", () => {
  it("reports a passing pair in both themes", () => {
    const results = checkContrast({ pairs: [pair()], themes: themes() });

    expect(results).toEqual([
      expect.objectContaining({
        theme: "light",
        foreground: "color.text.primary",
        passes: true,
      }),
      expect.objectContaining({
        theme: "dark",
        foreground: "color.text.primary",
        passes: true,
      }),
    ]);
    expect(results[0]?.ratio).toBeCloseTo(21, 10);
  });

  it("passes a pair exactly at its threshold", () => {
    const [light] = checkContrast({
      pairs: [pair({ min: 21 })],
      themes: themes(),
    });

    expect(light?.passes).toBe(true);
  });

  it("fails a pair just below its threshold", () => {
    const [light] = checkContrast({
      pairs: [pair({ min: 21.01 })],
      themes: themes(),
    });

    expect(light?.passes).toBe(false);
  });

  it("checks each theme on its own values", () => {
    const dark = [
      colorToken("color.text.primary", "#1a1a1a"),
      colorToken("color.background.primary", "#000000"),
    ];
    const results = checkContrast({
      pairs: [pair()],
      themes: themes({ dark }),
    });

    expect(results.map(({ theme, passes }) => ({ theme, passes }))).toEqual([
      { theme: "light", passes: true },
      { theme: "dark", passes: false },
    ]);
  });

  it("carries the threshold and the note of the pair into the result", () => {
    const [light] = checkContrast({
      pairs: [pair({ min: 3, note: "SC 1.4.11 — indicateur non textuel" })],
      themes: themes(),
    });

    expect(light).toEqual(
      expect.objectContaining({
        background: "color.background.primary",
        min: 3,
        note: "SC 1.4.11 — indicateur non textuel",
      }),
    );
  });

  it("fails on a role that does not exist in a theme, naming the role and the theme", () => {
    const dark = [colorToken("color.background.primary", "#000000")];

    expect(() => checkContrast({ pairs: [pair()], themes: themes({ dark }) })).toThrow(
      /color\.text\.primary.*dark/,
    );
  });

  it("refuses a translucent foreground, since its ratio depends on an unknown backdrop", () => {
    const light = [
      colorToken("color.text.primary", "#00000099"),
      colorToken("color.background.primary", "#ffffff"),
    ];

    expect(() => checkContrast({ pairs: [pair()], themes: themes({ light }) })).toThrow(
      /color\.text\.primary.*translucent.*light/,
    );
  });

  it("refuses a translucent background for the same reason", () => {
    const light = [
      colorToken("color.text.primary", "#000000"),
      colorToken("color.background.primary", "#ffffff80"),
    ];

    expect(() => checkContrast({ pairs: [pair()], themes: themes({ light }) })).toThrow(
      /color\.background\.primary.*translucent.*light/,
    );
  });

  it("accepts an 8-digit hex that is fully opaque", () => {
    const light = [
      colorToken("color.text.primary", "#000000ff"),
      colorToken("color.background.primary", "#ffffff"),
    ];
    const [result] = checkContrast({
      pairs: [pair()],
      themes: themes({ light }),
    });

    expect(result?.ratio).toBeCloseTo(21, 10);
  });

  it.each([
    ["a 7-digit hex", "#0000000"],
    ["a hex preceded by other characters", "a#000000"],
    ["a non-string value that would stringify to a hex", ["#000000"]],
  ])("fails on %s", (_label, value) => {
    const light = [
      { path: ["color", "text", "primary"], $type: "color", value },
      colorToken("color.background.primary", "#ffffff"),
    ];

    expect(() => checkContrast({ pairs: [pair()], themes: themes({ light }) })).toThrow(
      /not a 6- or 8-digit hex/,
    );
  });

  it("fails on a value that is not a hex colour", () => {
    const light = [
      colorToken("color.text.primary", "black"),
      colorToken("color.background.primary", "#ffffff"),
    ];

    expect(() => checkContrast({ pairs: [pair()], themes: themes({ light }) })).toThrow(
      /color\.text\.primary.*not a 6- or 8-digit hex.*black/,
    );
  });
});

describe("parseContrastPairs", () => {
  it("reads the pairs of a contrast-pairs file", () => {
    const file = {
      pairs: [
        { foreground: "color.text.primary", background: "color.background.primary", min: 4.5 },
        {
          foreground: "color.text.muted",
          background: "color.surface.primary",
          min: 3,
          note: "large",
        },
      ],
    };

    expect(parseContrastPairs(file)).toEqual(file.pairs);
  });

  it.each([
    ["no pairs list", {}],
    ["pairs that are not a list", { pairs: "nope" }],
    ["a pair that is not an object", { pairs: [null] }],
    ["a pair without a foreground", { pairs: [{ background: "b", min: 4.5 }] }],
    ["a pair without a background", { pairs: [{ foreground: "f", min: 4.5 }] }],
    [
      "a pair whose min is not a number",
      { pairs: [{ foreground: "f", background: "b", min: "4.5" }] },
    ],
    [
      "a pair whose note is not a string",
      { pairs: [{ foreground: "f", background: "b", min: 4.5, note: 1 }] },
    ],
  ])("refuses a file with %s", (_label, file) => {
    expect(() => parseContrastPairs(file)).toThrow(/contrast-pairs/);
  });
});
