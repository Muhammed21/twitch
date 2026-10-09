import { readFile } from "node:fs/promises";

import { bench, describe } from "vitest";

import { checkContrast, parseContrastPairs } from "../src/contrast/contrast.ts";
import { formatTextStyles, formatThemedColors } from "../src/formats/swift.ts";
import { resolveColorThemes, resolveSharedTokens } from "../src/resolve-themes.ts";

const themes = await resolveColorThemes();
const shared = await resolveSharedTokens();
const pairs = parseContrastPairs(JSON.parse(await readFile("tokens/contrast-pairs.json", "utf8")));
const typography = shared.filter(({ path }) => path[0] === "typography");

describe("design tokens, on the real token files", () => {
  bench("checkContrast", () => {
    checkContrast({ pairs, themes });
  });

  bench("formatThemedColors", () => {
    formatThemedColors(themes);
  });

  bench("formatTextStyles", () => {
    formatTextStyles(typography);
  });
});
