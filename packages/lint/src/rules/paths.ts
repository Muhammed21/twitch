import { dirname, resolve } from "node:path/posix";

export type Location = {
  readonly module: string;
  readonly layer: string | undefined;
};

const MODULE_PATH = /\/apps\/api\/src\/modules\/([^/]+)\/(?:([^/]+)\/)?/;

export const ROOT_LAYER = "racine du module";

export const locate = (path: string): Location | undefined => {
  const match = MODULE_PATH.exec(path);
  return match?.[1] === undefined ? undefined : { module: match[1], layer: match[2] };
};

export const locateImport = (importer: string, source: string): Location | undefined =>
  source.startsWith("./") || source.startsWith("../")
    ? locate(resolve(dirname(importer), source))
    : undefined;
