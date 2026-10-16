import { describe, expect, it } from "vitest";

import { isValidUsername, USERNAME_LENGTH } from "./username.ts";

describe("nom d'utilisateur (ADR 0039, §2)", () => {
  it("compte de 4 à 25 caractères, comme le slug de chaîne", () => {
    expect(USERNAME_LENGTH).toEqual({ min: 4, max: 25 });
  });

  it.each(["abcd", "a".repeat(25), "Viewer_42", "UPPER", "____", "1234"])("accepte %j", (value) => {
    expect(isValidUsername(value)).toBe(true);
  });

  it.each([
    "abc",
    "a".repeat(26),
    "bad-name",
    "bad name",
    "élodie",
    "",
    "admin",
    "Admin",
    "SETTINGS",
    "well_known",
    " admin",
    "abcd\n",
  ])("refuse %j", (value) => {
    expect(isValidUsername(value)).toBe(false);
  });
});
