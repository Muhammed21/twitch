import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

import { layerDependencies } from "./layer-dependencies.ts";
import { moduleBoundaries } from "./module-boundaries.ts";
import { noDisableArchitecture } from "./no-disable-architecture.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();

const MODULES = "/repo/apps/api/src/modules";

const inModule = (module: string, path: string) => `${MODULES}/${module}/${path}`;

tester.run("module-boundaries", moduleBoundaries, {
  valid: [
    {
      name: "import interne au module",
      filename: inModule("channel", "application/create-channel.ts"),
      code: 'import { Channel } from "../domain/channel.ts";',
    },
    {
      name: "import du dossier contracts d'un autre module",
      filename: inModule("channel", "application/on-account-registered.ts"),
      code: 'import type { AccountRegistered } from "../../identity/contracts/events.ts";',
    },
    {
      name: "import d'un package",
      filename: inModule("channel", "domain/channel.ts"),
      code: 'import { ok } from "@repo/result";',
    },
    {
      name: "export sans source",
      filename: inModule("channel", "domain/channel.ts"),
      code: "export const channel = 1;",
    },
    {
      name: "import dynamique non littéral",
      filename: inModule("channel", "infrastructure/loader.ts"),
      code: "const load = (path) => import(path);",
    },
    {
      name: "import dynamique d'un littéral qui n'est pas une chaîne",
      filename: inModule("channel", "infrastructure/loader.ts"),
      code: "const load = () => import(42);",
    },
    {
      name: "fichier hors des modules",
      filename: "/repo/apps/api/src/app.module.ts",
      code: 'import { IdentityModule } from "./modules/identity/identity.module.ts";',
    },
  ],
  invalid: [
    {
      name: "import du domaine d'un autre module",
      filename: inModule("channel", "application/create-channel.ts"),
      code: 'import { AccountId } from "../../identity/domain/account-id.ts";',
      errors: [{ messageId: "crossModule", data: { from: "channel", to: "identity" } }],
    },
    {
      name: "réexport depuis un autre module",
      filename: inModule("channel", "domain/index.ts"),
      code: 'export * from "../../identity/domain/account-id.ts";',
      errors: [{ messageId: "crossModule" }],
    },
    {
      name: "réexport nommé depuis un autre module",
      filename: inModule("channel", "domain/index.ts"),
      code: 'export { AccountId } from "../../identity/domain/account-id.ts";',
      errors: [{ messageId: "crossModule" }],
    },
    {
      name: "import dynamique d'un autre module",
      filename: inModule("channel", "infrastructure/loader.ts"),
      code: 'const load = () => import("../../identity/identity.module.ts");',
      errors: [{ messageId: "crossModule" }],
    },
  ],
});

tester.run("layer-dependencies", layerDependencies, {
  valid: [
    ...[
      ["domain", "domain"],
      ["application", "domain"],
      ["application", "application"],
      ["infrastructure", "application"],
      ["infrastructure", "domain"],
      ["presentation", "application"],
      ["presentation", "domain"],
      ["contracts", "domain"],
      ["infrastructure", "infrastructure"],
      ["presentation", "presentation"],
      ["contracts", "contracts"],
    ].map(([from, to]) => ({
      name: `${from} importe ${to}`,
      filename: inModule("identity", `${from}/file.ts`),
      code: `import { x } from "../${to}/other.ts";`,
    })),
    {
      name: "import vers un autre module, laissé à module-boundaries",
      filename: inModule("identity", "domain/file.ts"),
      code: 'import { x } from "../../channel/application/other.ts";',
    },
    {
      name: "dossier du module qui n'est pas une couche",
      filename: inModule("identity", "testing/factories.ts"),
      code: 'import { x } from "../infrastructure/other.ts";',
    },
    {
      name: "la racine du module importe toutes les couches",
      filename: inModule("identity", "identity.module.ts"),
      code: 'import { Controller } from "./presentation/me.controller.ts";',
    },
    {
      name: "import d'un package depuis le domaine",
      filename: inModule("identity", "domain/account-id.ts"),
      code: 'import { ok } from "@repo/result";',
    },
    {
      name: "fichier hors des modules",
      filename: "/repo/apps/api/src/platform/problem.ts",
      code: 'import { x } from "../modules/identity/infrastructure/x.ts";',
    },
  ],
  invalid: [
    ...[
      ["domain", "application"],
      ["domain", "infrastructure"],
      ["application", "infrastructure"],
      ["application", "presentation"],
      ["infrastructure", "presentation"],
      ["presentation", "infrastructure"],
      ["contracts", "application"],
    ].map(([from, to]) => ({
      name: `${from} n'importe pas ${to}`,
      filename: inModule("identity", `${from}/file.ts`),
      code: `import { x } from "../${to}/other.ts";`,
      errors: [{ messageId: "forbiddenLayer", data: { from, to } }],
    })),
    {
      name: "le domaine n'importe pas la racine du module",
      filename: inModule("identity", "domain/account-id.ts"),
      code: 'import { IdentityModule } from "../identity.module.ts";',
      errors: [{ messageId: "forbiddenLayer", data: { from: "domain", to: "racine du module" } }],
    },
  ],
});

const ARCHITECTURE_DISABLES = [
  "// oxlint-disable",
  "/*eslint-disable*/",
  "// oxlint-disable-next-line twitch/module-boundaries",
  "// eslint-disable-line twitch/layer-dependencies",
  "/* oxlint-disable no-restricted-imports */",
  "/* eslint-disable */",
  "// oxlint-disable-next-line no-console, twitch/layer-dependencies",
];

tester.run("no-disable-architecture", noDisableArchitecture, {
  valid: [
    {
      name: "désactivation d'une règle ordinaire",
      code: "// oxlint-disable-next-line no-console\nconsole.log(1);",
    },
    {
      name: "directive citée au milieu d'un commentaire",
      code: "// voir oxlint-disable twitch/module-boundaries plus haut\nconst a = 1;",
    },
    {
      name: "mot qui commence comme une directive",
      code: "// eslint-disabled par défaut\nconst a = 1;",
    },
    {
      name: "désactivation d'une règle au nom proche",
      code: "// oxlint-disable-next-line no-restricted-imports-extra, twitch-like/rule\nconst a = 1;",
    },
    {
      name: "commentaire ordinaire",
      code: "// la règle twitch/module-boundaries protège ceci\nconst a = 1;",
    },
  ],
  invalid: ARCHITECTURE_DISABLES.map((comment) => ({
    name: comment,
    code: `${comment}\nconst a = 1;`,
    errors: [{ messageId: "disabled" }],
  })),
});
