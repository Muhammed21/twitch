import type { TransformedToken } from "style-dictionary/types";

import type { DesignToken } from "./swift.ts";

export const toDesignToken = (token: TransformedToken): DesignToken => ({
  path: token.path,
  $type: String(token.$type),
  value: token.$value,
  comment: token.$description,
});
