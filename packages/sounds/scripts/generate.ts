import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { SOUND_NAMES, renderSound } from "../src/sounds.ts";

const soundsDir = resolve(
  import.meta.dirname,
  "../../../apps/ios/Packages/Core/DesignSystem/Sources/Sounds",
);
const fileOf = (name: string) => join(soundsDir, `${name}.wav`);

if (process.argv.includes("--check")) {
  const stale = await Promise.all(
    SOUND_NAMES.map(async (name) => {
      const committed = await readFile(fileOf(name)).catch(() => undefined);
      return committed !== undefined && Buffer.from(renderSound(name)).equals(committed)
        ? []
        : [name];
    }),
  );
  const names = stale.flat();
  if (names.length > 0) {
    process.stderr.write(
      `Sons périmés : ${names.join(", ")}. Lancez 'pnpm generate' et committez.\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(`Sons à jour (${SOUND_NAMES.length}).\n`);
  }
} else {
  await mkdir(soundsDir, { recursive: true });
  await Promise.all(SOUND_NAMES.map((name) => writeFile(fileOf(name), renderSound(name))));
  process.stdout.write(`${SOUND_NAMES.length} sons écrits dans ${soundsDir}.\n`);
}
