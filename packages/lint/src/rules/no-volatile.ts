import { defineRule } from "@oxlint/plugins";

export const noVolatile = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Le chat ne diffuse pas en volatile sur le moteur ws (ADR 0027, §1)",
    },
    messages: {
      volatile:
        'volatile perd des messages de clients en bonne santé avec le moteur ws : diffuser par except("saturated") (ADR 0027, §1).',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const { property } = node;
        const named = node.computed
          ? property.type === "Literal" && property.value === "volatile"
          : property.type === "Identifier" && property.name === "volatile";
        if (named) {
          context.report({ node: property, messageId: "volatile" });
        }
      },
    };
  },
});
