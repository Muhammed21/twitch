import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { formatCssVariables } from "../src/formats/css.ts";
import {
  formatDimensions,
  formatTextStyles,
  formatThemedColors,
  type DesignToken,
} from "../src/formats/swift.ts";
import { resolveColorThemes, resolveSharedTokens } from "../src/resolve-themes.ts";

const SWIFT_SOURCES = "platforms/swift/Sources/DesignTokens";
const CSS_OUTPUT = "platforms/css";

const [themes, shared] = await Promise.all([resolveColorThemes(), resolveSharedTokens()]);
const inCategory = (category: string): readonly DesignToken[] =>
  shared.filter(({ path }) => path[0] === category);

const files: Readonly<Record<string, string>> = {
  "Color+Tokens.swift": formatThemedColors(themes),
  "Typography+Tokens.swift": formatTextStyles(inCategory("typography")),
  "Spacing+Tokens.swift": formatDimensions(inCategory("spacing"), {
    namespace: "Spacing",
  }),
  "Radius+Tokens.swift": formatDimensions(inCategory("radius"), {
    namespace: "Radius",
  }),
};

await mkdir(SWIFT_SOURCES, { recursive: true });
await Promise.all(
  Object.entries(files).map(([name, contents]) => writeFile(join(SWIFT_SOURCES, name), contents)),
);

await mkdir(CSS_OUTPUT, { recursive: true });
await writeFile(join(CSS_OUTPUT, "tokens.css"), formatCssVariables({ themes, shared }));
