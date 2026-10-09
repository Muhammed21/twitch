import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  formatDimensions,
  formatTextStyles,
  formatThemedColors,
  type DesignToken,
} from "../src/formats/swift.ts";
import { resolveColorThemes, resolveSharedTokens } from "../src/resolve-themes.ts";

const SWIFT_SOURCES = "platforms/swift/Sources/DesignTokens";

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
