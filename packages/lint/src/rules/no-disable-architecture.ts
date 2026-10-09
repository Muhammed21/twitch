import { defineRule } from "@oxlint/plugins";

const DIRECTIVE = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(\s.*)?$/s;

const isArchitectureRule = (rule: string): boolean =>
  rule.startsWith("twitch/") || rule === "no-restricted-imports";

const disablesArchitecture = (comment: string): boolean => {
  const directive = DIRECTIVE.exec(comment);
  if (directive === null) {
    return false;
  }
  const rules = (directive[1] ?? "").split(/[\s,]/).filter((rule) => rule !== "");
  return rules.length === 0 || rules.some(isArchitectureRule);
};

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
