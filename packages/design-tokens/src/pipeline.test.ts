import { describe, expect, it } from "vitest";

import { resolveColorThemes, resolveSharedTokens } from "./resolve-themes.ts";

const paths = (tokens: readonly { readonly path: readonly string[] }[]) =>
  tokens.map(({ path }) => path.join("."));

describe("resolveColorThemes, on the real token files", () => {
  it("resolves the same semantic roles in both themes", async () => {
    const { light, dark } = await resolveColorThemes();

    expect(paths(light)).toEqual(paths(dark));
    expect(paths(light)).toContain("color.background.primary");
  });

  it("never lets a core primitive out of the package", async () => {
    const { light, dark } = await resolveColorThemes();

    expect([...paths(light), ...paths(dark)].filter((path) => path.startsWith("core."))).toEqual(
      [],
    );
  });

  it("resolves every alias to a hex value", async () => {
    const { light, dark } = await resolveColorThemes();

    expect(
      [...light, ...dark].filter(
        ({ value }) => !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(String(value)),
      ),
    ).toEqual([]);
  });

  it("carries the DTCG type and description of each role", async () => {
    const { light } = await resolveColorThemes();
    const background = light.find(({ path }) => path.join(".") === "color.background.primary");

    expect(background).toEqual(
      expect.objectContaining({
        $type: "color",
        comment: "Fond des écrans.",
        value: "#f7f7f8",
      }),
    );
  });

  it("gives every role a description", async () => {
    const { light, dark } = await resolveColorThemes();

    expect(
      [...light, ...dark].filter(({ comment }) => comment === undefined || comment === ""),
    ).toEqual([]);
  });
});

describe("resolveSharedTokens, on the real token files", () => {
  it("resolves typography, spacing and radius, without any colour", async () => {
    const tokens = await resolveSharedTokens();
    const categories = new Set(tokens.flatMap(({ path }) => path.slice(0, 1)));

    expect([...categories].toSorted((first, second) => first.localeCompare(second))).toEqual([
      "radius",
      "spacing",
      "typography",
    ]);
  });

  it("never lets a core primitive out of the package", async () => {
    const tokens = await resolveSharedTokens();

    expect(tokens.filter(({ path }) => path[0] === "core")).toEqual([]);
  });

  it("resolves spacing aliases to their pixel value", async () => {
    const tokens = await resolveSharedTokens();
    const x8 = tokens.find(({ path }) => path.join(".") === "spacing.x8");

    expect(x8).toEqual(expect.objectContaining({ $type: "dimension", value: "8px" }));
  });

  it("gives every shared token a description", async () => {
    const tokens = await resolveSharedTokens();

    expect(tokens.filter(({ comment }) => comment === undefined || comment === "")).toEqual([]);
  });
});
