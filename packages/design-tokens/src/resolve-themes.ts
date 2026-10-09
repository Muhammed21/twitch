import StyleDictionary from "style-dictionary";

import { toDesignToken } from "./formats/style-dictionary.ts";
import type { DesignToken } from "./formats/swift.ts";

const resolvedSemanticTokens = async (
  sources: readonly string[],
): Promise<readonly DesignToken[]> => {
  const dictionary = new StyleDictionary({
    source: [...sources],
    platforms: { resolved: {} },
  });
  const { allTokens } = await dictionary.getPlatformTokens("resolved");

  return allTokens.filter((token) => token.path[0] !== "core").map(toDesignToken);
};

export const resolveColorThemes = async () => {
  const [light, dark] = await Promise.all([
    resolvedSemanticTokens(["tokens/core/**/*.json", "tokens/semantic/color.light.json"]),
    resolvedSemanticTokens(["tokens/core/**/*.json", "tokens/semantic/color.dark.json"]),
  ]);

  return { light, dark };
};

export const resolveSharedTokens = (): Promise<readonly DesignToken[]> =>
  resolvedSemanticTokens([
    "tokens/core/**/*.json",
    "tokens/semantic/typography.json",
    "tokens/semantic/spacing.json",
  ]);
