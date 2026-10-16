export type SwiftFile = { readonly path: string; readonly code: string };

type Import = { readonly path: string; readonly line: number; readonly module: string };

const FEATURE = /^apps\/ios\/Packages\/Features\/(\w+)\//g;
const DESIGN_SYSTEM = "apps/ios/Packages/Core/DesignSystem/";
const DESIGN_TOKENS = "DesignTokens";

const IMPORT =
  /^[ \t]*(?:@\w+(?:\([^)\n]*\))?[ \t]+)*(?:(?:public|package|internal|fileprivate|private)[ \t]+)?import[ \t]+(?:(?:typealias|struct|class|enum|protocol|let|var|func)[ \t]+)?(\w+)/gm;

const FEATURE_RULE = "une feature n'importe pas une autre feature (ADR 0010, règle 4)";
const TOKENS_RULE = "seul Core/DesignSystem importe DesignTokens (ADR 0019, règle 5 bis)";

const featuresOf = (path: string): readonly string[] =>
  [...path.matchAll(FEATURE)].flatMap((match) => match.slice(1));

const lineOf = (code: string, offset: number): number => code.slice(0, offset).split("\n").length;

const importsOf = ({ path, code }: SwiftFile): readonly Import[] =>
  [...code.matchAll(IMPORT)].flatMap((match) =>
    match.slice(1).map((module) => ({ path, line: lineOf(code, match.index), module })),
  );

const refusal = ({ path, line, module }: Import, rule: string): string =>
  `${path}:${line} : \`import ${module}\` refusé, ${rule}.`;

const ruleBroken = (
  { path, module }: Import,
  ownerOf: ReadonlyMap<string, string>,
): string | undefined => {
  if (module === DESIGN_TOKENS && !path.startsWith(DESIGN_SYSTEM)) return TOKENS_RULE;
  const imported = ownerOf.get(module);
  return imported !== undefined && featuresOf(path).some((importer) => importer !== imported)
    ? FEATURE_RULE
    : undefined;
};

export const findImportViolations = (files: readonly SwiftFile[]): readonly string[] => {
  const ownerOf = new Map(
    files
      .flatMap(({ path }) => featuresOf(path))
      .flatMap((feature) => [
        [feature, feature],
        [`${feature}Fixtures`, feature],
      ]),
  );

  return files.flatMap(importsOf).flatMap((found) => {
    const rule = ruleBroken(found, ownerOf);
    return rule === undefined ? [] : [refusal(found, rule)];
  });
};

export const importsVerdict = ({
  violations,
  fileCount,
}: {
  readonly violations: readonly string[];
  readonly fileCount: number;
}): { readonly ok: boolean; readonly message: string } => {
  if (fileCount === 0) {
    return {
      ok: false,
      message:
        "Aucun fichier Swift sous apps/ios/ : le lint des imports ne vérifie plus rien. Corrigez le chemin dans packages/ios-imports/scripts/check.ts.",
    };
  }
  if (violations.length > 0) {
    return {
      ok: false,
      message: [...violations, `Imports iOS refusés : ${violations.length}.`].join("\n"),
    };
  }
  return { ok: true, message: `Imports iOS conformes (${fileCount} fichiers Swift).` };
};
