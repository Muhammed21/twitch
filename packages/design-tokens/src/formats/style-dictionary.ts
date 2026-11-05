import type { TransformedToken } from "style-dictionary/types";

import type { DesignToken } from "./swift.ts";

const REDUCED_MOTION = "com.twitch.reducedMotion";

const reducedMotionOf = (token: TransformedToken): { readonly reducedMotion?: unknown } => {
  const extensions: unknown = token.$extensions;

  return typeof extensions === "object" && extensions !== null && REDUCED_MOTION in extensions
    ? { reducedMotion: extensions[REDUCED_MOTION] }
    : {};
};

export const toDesignToken = (token: TransformedToken): DesignToken => ({
  path: token.path,
  $type: String(token.$type),
  value: token.$value,
  comment: token.$description,
  ...reducedMotionOf(token),
});
