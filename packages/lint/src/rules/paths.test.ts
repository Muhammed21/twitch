import { describe, expect, it } from "vitest";

import { locate, locateImport } from "./paths.ts";

const MODULES = "/repo/apps/api/src/modules";

describe("locate", () => {
  it.each([
    [`${MODULES}/identity/domain/account-id.ts`, { module: "identity", layer: "domain" }],
    [`${MODULES}/identity/identity.module.ts`, { module: "identity", layer: undefined }],
    [
      `${MODULES}/identity/presentation/http/me.controller.ts`,
      { module: "identity", layer: "presentation" },
    ],
  ])("situe %s", (path, location) => {
    expect(locate(path)).toEqual(location);
  });

  it.each([
    "/repo/apps/api/src/platform/problem.ts",
    "/repo/packages/db/src/index.ts",
    `${MODULES}/`,
  ])("ne situe pas %s", (path) => {
    expect(locate(path)).toBeUndefined();
  });
});

describe("locateImport", () => {
  const importer = `${MODULES}/channel/application/create-channel.ts`;

  it.each([
    ["../domain/channel.ts", { module: "channel", layer: "domain" }],
    ["./use-case.ts", { module: "channel", layer: "application" }],
    ["../../identity/contracts/events.ts", { module: "identity", layer: "contracts" }],
  ])("situe l'import relatif %s", (source, location) => {
    expect(locateImport(importer, source)).toEqual(location);
  });

  it.each([
    "@repo/db",
    "@nestjs/common",
    "zod",
    "node:path",
    "channel/domain/x.ts",
    ".hidden/x.ts",
  ])("ignore l'import non relatif %s", (source) => {
    expect(locateImport(importer, source)).toBeUndefined();
  });
});
