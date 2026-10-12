import { describe, expect, it } from "vitest";

import { authenticationClaims, authenticationMethodsFor } from "./authentication-context.ts";

describe("méthodes d'authentification d'une session (ADR 0033 §2)", () => {
  it.each(["/sign-up/email", "/sign-in/email"])("trace le mot de passe pour %s", (path) => {
    expect(authenticationMethodsFor(path)).toEqual(["pwd"]);
  });

  it.each(["/two-factor/verify-totp", "/two-factor/verify-backup-code"])(
    "trace le mot de passe et le second facteur pour %s",
    (path) => {
      expect(authenticationMethodsFor(path)).toEqual(["pwd", "otp", "mfa"]);
    },
  );

  it.each(["/oauth2/token", "/sign-in/social", "", "constructor", "toString"])(
    "ne trace aucune méthode pour un endpoint inconnu %j",
    (path) => {
      expect(authenticationMethodsFor(path)).toEqual([]);
    },
  );
});

describe("claims d'authentification du jeton d'accès (ADR 0033 §1)", () => {
  it("porte l'heure d'authentification en secondes et les méthodes de la session", () => {
    expect(
      authenticationClaims({
        createdAt: new Date("2026-10-12T12:00:00.999Z"),
        amr: ["pwd", "otp", "mfa"],
      }),
    ).toEqual({ twitch_auth_time: 1_791_806_400, twitch_amr: ["pwd", "otp", "mfa"] });
  });

  it("ne porte aucune méthode quand la session n'en a pas enregistré", () => {
    expect(authenticationClaims({ createdAt: new Date(0), amr: null })).toEqual({
      twitch_auth_time: 0,
      twitch_amr: [],
    });
  });
});
