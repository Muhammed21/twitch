import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vitest";

import plugin from "../index.ts";
import { layerDependencies } from "./layer-dependencies.ts";
import { moduleBoundaries } from "./module-boundaries.ts";
import { noDisableArchitecture } from "./no-disable-architecture.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
const MODULES = "/repo/apps/api/src/modules";

describe("plugin twitch", () => {
  it("expose ses trois règles sous le nom twitch", () => {
    expect(plugin.meta?.name).toBe("twitch");
    expect(Object.keys(plugin.rules).toSorted()).toEqual([
      "layer-dependencies",
      "module-boundaries",
      "no-disable-architecture",
    ]);
  });

  it.each([
    ["module-boundaries", moduleBoundaries, "ADR 0002, règle 1"],
    ["layer-dependencies", layerDependencies, "ADR 0002"],
    ["no-disable-architecture", noDisableArchitecture, "ADR 0029"],
  ])("%s est un problème documenté qui cite son ADR", (_name, rule, adr) => {
    expect(rule.meta?.type).toBe("problem");
    expect(rule.meta?.docs?.description).toContain(adr);
  });
});

tester.run("module-boundaries (message)", moduleBoundaries, {
  valid: [],
  invalid: [
    {
      filename: `${MODULES}/channel/domain/x.ts`,
      code: 'import { a } from "../../identity/domain/account-id.ts";',
      errors: [
        {
          message:
            "Le module channel importe l'intérieur du module identity : passer par un event, ou par identity/contracts/ (ADR 0002, règle 1).",
        },
      ],
    },
  ],
});

tester.run("layer-dependencies (message)", layerDependencies, {
  valid: [],
  invalid: [
    {
      filename: `${MODULES}/identity/domain/x.ts`,
      code: 'import { a } from "../application/y.ts";',
      errors: [
        {
          message:
            "La couche domain n'importe pas application : presentation et infrastructure → application → domain (ADR 0002).",
        },
      ],
    },
  ],
});

tester.run("no-disable-architecture (message)", noDisableArchitecture, {
  valid: [],
  invalid: [
    {
      code: "// oxlint-disable-next-line twitch/module-boundaries\nconst a = 1;",
      errors: [
        {
          message:
            "Une règle d'architecture ne se désactive pas par commentaire : changer la règle dans packages/lint, en revue critical (ADR 0029).",
        },
      ],
    },
  ],
});
