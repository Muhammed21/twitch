import { parseHexColor, type HexColor } from "../color/hex.ts";
import type { DesignToken } from "../formats/swift.ts";

export type ContrastPair = {
  readonly foreground: string;
  readonly background: string;
  readonly min: number;
  readonly note?: string;
};

export type Theme = "light" | "dark";

export type ContrastResult = ContrastPair & {
  readonly theme: Theme;
  readonly ratio: number;
  readonly passes: boolean;
};

const channelLuminance = (channel: number): number => {
  const srgb = channel / 255;

  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = ({ red, green, blue }: HexColor): number =>
  0.2126 * channelLuminance(red) +
  0.7152 * channelLuminance(green) +
  0.0722 * channelLuminance(blue);

const parseOrThrow = (value: unknown, label: string): HexColor => {
  const color = parseHexColor(value);

  if (color === undefined) {
    throw new Error(
      `${label} is not a 6- or 8-digit hex colour: ${String(value)}.`,
    );
  }

  return color;
};

const ratioBetween = (foreground: HexColor, background: HexColor): number => {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((first, second) => second - first) as [number, number];

  return (lighter + 0.05) / (darker + 0.05);
};

export const contrastRatio = (foreground: string, background: string): number =>
  ratioBetween(
    parseOrThrow(foreground, "Foreground"),
    parseOrThrow(background, "Background"),
  );

const opaqueColor = (
  tokens: readonly DesignToken[],
  role: string,
  theme: Theme,
): HexColor => {
  const token = tokens.find((candidate) => candidate.path.join(".") === role);

  if (token === undefined) {
    throw new Error(
      `Contrast pair references "${role}", which does not exist in the ${theme} theme.`,
    );
  }

  const color = parseOrThrow(token.value, `"${role}" in the ${theme} theme`);

  if (color.alpha !== undefined && color.alpha !== 255) {
    throw new Error(
      `"${role}" is translucent in the ${theme} theme: a ratio is meaningless without an explicit backdrop.`,
    );
  }

  return color;
};

export const checkContrast = ({
  pairs,
  themes,
}: {
  readonly pairs: readonly ContrastPair[];
  readonly themes: Readonly<Record<Theme, readonly DesignToken[]>>;
}): readonly ContrastResult[] =>
  pairs.flatMap((pair) =>
    (["light", "dark"] as const).map((theme) => {
      const ratio = ratioBetween(
        opaqueColor(themes[theme], pair.foreground, theme),
        opaqueColor(themes[theme], pair.background, theme),
      );

      return { ...pair, theme, ratio, passes: ratio >= pair.min };
    }),
  );
