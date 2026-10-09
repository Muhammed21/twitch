import type { ESTree, Visitor } from "@oxlint/plugins";

type WithSource =
  | ESTree.ImportDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ImportExpression;

const sourceOf = ({ source }: WithSource): string | undefined =>
  source?.type === "Literal" && typeof source.value === "string" ? source.value : undefined;

export const onImport = (check: (source: string, node: WithSource) => void): Visitor => {
  const fromSource = (node: WithSource) => {
    const source = sourceOf(node);
    if (source !== undefined) {
      check(source, node);
    }
  };
  return {
    ImportDeclaration: fromSource,
    ExportAllDeclaration: fromSource,
    ExportNamedDeclaration: fromSource,
    ImportExpression: fromSource,
  };
};
