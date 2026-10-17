import { describe, expect, it } from "vitest";

import { SIGNUP_ERRORS, signupErrorOf } from "./signup-page.ts";

describe("messages d'erreur de l'inscription (ADR 0039, §3)", () => {
  it.each([
    ["USERNAME_IS_ALREADY_TAKEN", SIGNUP_ERRORS.usernameTaken],
    ["USERNAME_IS_INVALID", SIGNUP_ERRORS.usernameInvalid],
    ["USERNAME_TOO_SHORT", SIGNUP_ERRORS.usernameInvalid],
    ["USERNAME_TOO_LONG", SIGNUP_ERRORS.usernameInvalid],
    ["USER_ALREADY_EXISTS", SIGNUP_ERRORS.emailTaken],
    ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", SIGNUP_ERRORS.emailTaken],
    ["INVALID_EMAIL", SIGNUP_ERRORS.emailInvalid],
    ["PASSWORD_TOO_SHORT", SIGNUP_ERRORS.password],
    ["PASSWORD_TOO_LONG", SIGNUP_ERRORS.password],
    ["BIRTH_DATE_MISSING", SIGNUP_ERRORS.birthDate],
    ["BIRTH_DATE_MALFORMED", SIGNUP_ERRORS.birthDate],
    ["BIRTH_DATE_FUTURE", SIGNUP_ERRORS.birthDate],
    ["BIRTH_DATE_TOO_YOUNG", SIGNUP_ERRORS.tooYoung],
    ["RATE_LIMITED", SIGNUP_ERRORS.unknown],
    ["", SIGNUP_ERRORS.unknown],
  ])("%s s'affiche « %s »", (code, message) => {
    expect(signupErrorOf(code)).toBe(message);
  });

  it("donne un message distinct à chaque cause", () => {
    expect(new Set(Object.values(SIGNUP_ERRORS)).size).toBe(Object.keys(SIGNUP_ERRORS).length);
  });
});
