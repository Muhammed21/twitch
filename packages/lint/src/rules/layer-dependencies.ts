import { defineRule } from "@oxlint/plugins";

import { onImport } from "./imports.ts";
import { locate, locateImport, ROOT_LAYER } from "./paths.ts";

const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  domain: ["domain"],
  application: ["domain", "application"],
  infrastructure: ["domain", "application", "infrastructure"],
  presentation: ["domain", "application", "presentation"],
  contracts: ["domain", "contracts"],
};

export const layerDependencies = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Couches d'un module : presentation et infrastructure → application → domain (ADR 0002)",
    },
    messages: {
      forbiddenLayer:
        "La couche {{from}} n'importe pas {{to}} : presentation et infrastructure → application → domain (ADR 0002).",
    },
  },
  create(context) {
    const importer = locate(context.filename);
    if (importer?.layer === undefined) {
      return {};
    }
    const from = importer.layer;
    const allowed = ALLOWED[from];
    if (allowed === undefined) {
      return {};
    }
    return onImport((source, node) => {
      const target = locateImport(context.filename, source);
      const to = target?.layer ?? ROOT_LAYER;
      if (target?.module === importer.module && !allowed.includes(to)) {
        context.report({ node, messageId: "forbiddenLayer", data: { from, to } });
      }
    });
  },
});
