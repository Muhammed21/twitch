import { describe, expect, it } from "vitest";

import { resolveColorThemes } from "./resolve-themes.ts";

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

    expect(
      [...paths(light), ...paths(dark)].filter((path) =>
        path.startsWith("core."),
      ),
    ).toEqual([]);
  });

  it("resolves every alias to a hex value", async () => {
    const { light, dark } = await resolveColorThemes();

    expect(
      [...light, ...dark].filter(
        ({ value }) =>
          !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(String(value)),
      ),
    ).toEqual([]);
  });

  it("carries the DTCG type and description of each role", async () => {
    const { light } = await resolveColorThemes();
    const background = light.find(
      ({ path }) => path.join(".") === "color.background.primary",
    );

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
      [...light, ...dark].filter(
        ({ comment }) => comment === undefined || comment === "",
      ),
    ).toEqual([]);
  });
});
