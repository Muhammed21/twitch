import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { formatThemedColors } from "../src/formats/swift.ts";
import { resolveColorThemes } from "../src/resolve-themes.ts";

const SWIFT_SOURCES = "platforms/swift/Sources/DesignTokens";

const themes = await resolveColorThemes();

await mkdir(SWIFT_SOURCES, { recursive: true });
await writeFile(
  join(SWIFT_SOURCES, "Color+Tokens.swift"),
  formatThemedColors(themes),
);
