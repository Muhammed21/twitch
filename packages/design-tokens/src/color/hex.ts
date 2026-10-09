export type HexColor = {
  readonly hex: string;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number | undefined;
};

export const parseHexColor = (value: unknown): HexColor | undefined => {
  const digits =
    typeof value === "string" ? /^#([0-9a-fA-F]{6}([0-9a-fA-F]{2})?)$/.exec(value)?.[1] : undefined;

  if (digits === undefined) {
    return undefined;
  }

  const channel = (index: number): number =>
    Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16);

  return {
    hex: `#${digits.toUpperCase()}`,
    red: channel(0),
    green: channel(1),
    blue: channel(2),
    alpha: digits.length === 8 ? channel(3) : undefined,
  };
};
