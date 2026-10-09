import { defineRule } from "@oxlint/plugins";

import { onImport } from "./imports.ts";
import { locate, locateImport } from "./paths.ts";

export const moduleBoundaries = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Un module de l'API n'importe un autre module que par son dossier contracts/ (ADR 0002, règle 1)",
    },
    messages: {
      crossModule:
        "Le module {{from}} importe l'intérieur du module {{to}} : passer par un event, ou par {{to}}/contracts/ (ADR 0002, règle 1).",
    },
  },
  create(context) {
    const importer = locate(context.filename);
    if (importer === undefined) {
      return {};
    }
    return onImport((source, node) => {
      const target = locateImport(context.filename, source);
      if (
        target !== undefined &&
        target.module !== importer.module &&
        target.layer !== "contracts"
      ) {
        context.report({
          node,
          messageId: "crossModule",
          data: { from: importer.module, to: target.module },
        });
      }
    });
  },
});
