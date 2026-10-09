import { describe, expect, it } from "vitest";

import { findArchitectureDisables } from "./scan.ts";

const CROSS_MODULE_IMPORT =
  'import { a } from "../../identity/domain/account-id.ts"; // oxlint-disable-line';

describe("findArchitectureDisables", () => {
  it("trouve une directive -line qui se masque elle-même, sur un import entre modules", () => {
    expect(
      findArchitectureDisables([
        { path: "apps/api/src/modules/channel/application/x.ts", code: `${CROSS_MODULE_IMPORT}\n` },
      ]),
    ).toEqual(["apps/api/src/modules/channel/application/x.ts:1"]);
  });

  it("trouve aussi la forme qui nomme no-disable-architecture", () => {
    expect(
      findArchitectureDisables([
        {
          path: "a.ts",
          code: "const a = 1;\nconst b = 2; // oxlint-disable-line twitch/module-boundaries, twitch/no-disable-architecture\n",
        },
      ]),
    ).toEqual(["a.ts:2"]);
  });

  it("ignore une chaîne qui cite une directive, et une désactivation ordinaire", () => {
    expect(
      findArchitectureDisables([
        {
          path: "a.test.ts",
          code: 'const cases = ["// oxlint-disable-line twitch/layer-dependencies"];\n// oxlint-disable-next-line no-console\nconsole.log(cases);\n',
        },
      ]),
    ).toEqual([]);
  });

  it("lit les fichiers JSX et TypeScript", () => {
    expect(
      findArchitectureDisables([
        { path: "a.tsx", code: "const a = <div />; // eslint-disable-line\n" },
      ]),
    ).toEqual(["a.tsx:1"]);
  });
});
