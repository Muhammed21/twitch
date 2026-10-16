import { describe, expect, it } from "vitest";

import { EMAIL_CODE, emailCodeMessage } from "./verification-email.ts";

describe("e-mail du code de vérification", () => {
  it("envoie un code à 6 chiffres valable 5 minutes", () => {
    expect(EMAIL_CODE).toEqual({ length: 6, lifetimeSeconds: 300 });
  });

  it("donne le code et sa durée de validité, en anglais comme les captures", () => {
    expect(emailCodeMessage({ code: "482913", purpose: "email-verification" })).toEqual({
      subject: "Your Twitch verification code",
      text: "Your verification code is 482913. It expires in 5 minutes. If you didn't request it, you can ignore this email.",
    });
  });

  it("annonce une réinitialisation du mot de passe dans l'objet", () => {
    expect(emailCodeMessage({ code: "482913", purpose: "forget-password" }).subject).toBe(
      "Your Twitch password reset code",
    );
  });

  it.each(["sign-in", "change-email"] as const)("garde l'objet générique pour %s", (purpose) => {
    expect(emailCodeMessage({ code: "1", purpose }).subject).toBe("Your Twitch verification code");
  });
});
