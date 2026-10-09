const DIRECTIVE = /^\s*(?:oxlint|eslint)-disable(?:-next-line|-line)?(\s.*)?$/s;

const isArchitectureRule = (rule: string): boolean =>
  rule.startsWith("twitch/") || rule === "no-restricted-imports";

export const disablesArchitecture = (comment: string): boolean => {
  const directive = DIRECTIVE.exec(comment);
  if (directive === null) {
    return false;
  }
  const rules = (directive[1] ?? "").split(/[\s,]/).filter((rule) => rule !== "");
  return rules.length === 0 || rules.some(isArchitectureRule);
};
