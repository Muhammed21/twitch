import { defineRule, type ESTree } from "@oxlint/plugins";

type Key = ESTree.MemberExpression["property"] | ESTree.PropertyKey;

const VOLATILE = "volatile";

const namesVolatile = (key: Key, computed: boolean): boolean => {
  if (!computed) {
    return key.type === "Identifier" && key.name === VOLATILE;
  }
  if (key.type === "TemplateLiteral") {
    return key.expressions.length === 0 && key.quasis[0]?.value.cooked === VOLATILE;
  }
  return key.type === "Literal" && key.value === VOLATILE;
};

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
        if (namesVolatile(node.property, node.computed)) {
          context.report({ node: node.property, messageId: "volatile" });
        }
      },
      ObjectPattern(node) {
        node.properties
          .filter((property) => property.type === "Property")
          .filter((property) => namesVolatile(property.key, property.computed))
          .forEach((property) => context.report({ node: property.key, messageId: "volatile" }));
      },
    };
  },
});
