import { defineRule } from "@oxlint/plugins";

import { disablesArchitecture } from "../directives.ts";

export const noDisableArchitecture = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Une règle d'architecture ne se désactive pas par commentaire (ADR 0029)",
    },
    messages: {
      disabled:
        "Une règle d'architecture ne se désactive pas par commentaire : changer la règle dans packages/lint, en revue critical (ADR 0029).",
    },
  },
  create(context) {
    return {
      Program() {
        context.sourceCode
          .getAllComments()
          .filter((comment) => disablesArchitecture(comment.value))
          .forEach((comment) => context.report({ loc: comment.loc, messageId: "disabled" }));
      },
    };
  },
});
