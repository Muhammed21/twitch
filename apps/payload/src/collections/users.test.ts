import { describe, expect, it } from "vitest";

import { actingUserIdProblem, neverAfterCreation, Users } from "./users";

const actingUserIdField = () =>
  Users.fields.find((field) => "name" in field && field.name === "actingUserId");

describe("compte API d'un administrateur Payload (ADR 0007)", () => {
  it("porte l'identifiant de son compte API, en texte indexé et unique", () => {
    expect(actingUserIdField()).toMatchObject({
      name: "actingUserId",
      type: "text",
      unique: true,
      index: true,
    });
  });

  it("se pose à la création du compte et ne se modifie plus", () => {
    const field = actingUserIdField();
    const access = field !== undefined && "access" in field ? field.access : undefined;

    expect(access).toEqual({ update: neverAfterCreation });
    expect(neverAfterCreation()).toBe(false);
  });

  it.each([
    ["absent", undefined],
    ["nul", null],
    ["vide", ""],
    ["un identifiant de compte", "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e"],
  ])("accepte un identifiant %s", (_name, value) => {
    expect(actingUserIdProblem(value)).toBeUndefined();
  });

  it.each([
    ["en majuscules", "8B1C2D3E-4F5A-4B6C-8D7E-9F0A1B2C3D4E"],
    ["qui n'est pas un UUID", "admin"],
  ])("refuse un identifiant %s", (_name, value) => {
    expect(actingUserIdProblem(value)).toBe(
      "Un identifiant de compte API est un UUID en minuscules.",
    );
  });
});
