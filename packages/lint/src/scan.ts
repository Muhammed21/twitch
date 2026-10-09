import { parseSync } from "oxc-parser";

import { disablesArchitecture } from "./directives.ts";

export type SourceFile = { readonly path: string; readonly code: string };

const lineOf = (code: string, offset: number): number => code.slice(0, offset).split("\n").length;

export const findArchitectureDisables = (files: readonly SourceFile[]): readonly string[] =>
  files.flatMap(({ path, code }) =>
    parseSync(path, code)
      .comments.filter((comment) => disablesArchitecture(comment.value))
      .map((comment) => `${path}:${lineOf(code, comment.start)}`),
  );
