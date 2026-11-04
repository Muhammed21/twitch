import { describe, expect, it } from "vitest";

import { imageRejected } from "./image-problems.ts";

describe("refus d'une image, au format RFC 9457", () => {
  it.each([
    [
      "upload_not_found",
      "Envoi introuvable",
      "Préparez un nouvel envoi : celui-ci n'existe pas ou a expiré.",
    ],
    ["too_large", "Image trop lourde", "Une image d'avatar pèse au plus 10 Mio."],
    ["unsupported_type", "Type d'image refusé", "Envoyez une image JPEG, PNG ou WebP."],
    ["too_small", "Image trop petite", "Une image d'avatar mesure au moins 256 × 256 pixels."],
    ["too_many_pixels", "Image trop grande", "Une image compte au plus 40 millions de pixels."],
  ] as const)("rend un 422 pour %s", (rejection, title, detail) => {
    expect(imageRejected({ rejection, purpose: "avatar" }).problem).toEqual({
      type: "about:blank",
      status: 422,
      title,
      detail,
    });
  });

  it.each([
    ["banner", "Une bannière mesure au moins 1200 × 480 pixels."],
    ["category", "Une image de catégorie mesure au moins 285 × 380 pixels."],
  ] as const)("donne les dimensions minimales de l'usage %s", (purpose, detail) => {
    expect(imageRejected({ rejection: "too_small", purpose }).problem.detail).toBe(detail);
  });

  it("donne le poids maximal d'une bannière", () => {
    expect(imageRejected({ rejection: "too_large", purpose: "banner" }).problem.detail).toBe(
      "Une bannière pèse au plus 10 Mio.",
    );
  });
});
