import { readFile } from "node:fs/promises";

import { checkContrast, type ContrastPair } from "../src/contrast/contrast.ts";
import { resolveColorThemes } from "../src/resolve-themes.ts";

const { pairs } = JSON.parse(
  await readFile("tokens/contrast-pairs.json", "utf8"),
) as {
  readonly pairs: readonly ContrastPair[];
};

const results = checkContrast({ pairs, themes: await resolveColorThemes() });

for (const { theme, foreground, background, ratio, min, passes } of results) {
  process.stdout.write(
    `${passes ? "ok  " : "FAIL"}  ${theme.padEnd(5)}  ${ratio.toFixed(2).padStart(5)}:1 (min ${min})  ${foreground} sur ${background}\n`,
  );
}

const failures = results.filter(({ passes }) => !passes);

if (failures.length > 0) {
  process.stderr.write(
    `\n${failures.length} paire(s) sous leur seuil de contraste.\n`,
  );
  process.exit(1);
}
