import { describe, expect, it } from "vitest";

import { firstFreeSlug, parseChannelSlug, RESERVED_SLUGS, slugCandidates } from "./channel-slug.ts";

const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const candidatesOf = (displayName: string) =>
  slugCandidates({ displayName, accountId: ACCOUNT_ID }).map(String);

describe("format d'un slug (ADR 0035 §1)", () => {
  it.each(["streamer_de_test", "abcd", "a1b2", "x".repeat(25), "user_2"])("accepte %j", (slug) => {
    expect(parseChannelSlug(slug)).toEqual({ ok: true, value: slug });
  });

  it.each([
    ["trop court", "abc"],
    ["trop long", "x".repeat(26)],
    ["vide", ""],
    ["avec une majuscule", "Streamer"],
    ["avec un tiret", "streamer-test"],
    ["avec une espace", "streamer test"],
    ["avec un accent", "élodie_42"],
    ["avec un retour à la ligne final", "streamer\n"],
  ])("refuse un slug %s", (_name, slug) => {
    expect(parseChannelSlug(slug)).toEqual({ ok: false, error: "malformed" });
  });
});

describe("mots réservés (ADR 0035 §2)", () => {
  it("réserve les routes et les rôles de l'application", () => {
    expect(RESERVED_SLUGS).toEqual([
      "admin",
      "api",
      "auth",
      "directory",
      "help",
      "login",
      "logout",
      "moderator",
      "privacy",
      "search",
      "settings",
      "signup",
      "staff",
      "support",
      "terms",
      "twitch",
      "well_known",
    ]);
  });

  it.each(RESERVED_SLUGS)("refuse le slug réservé %j", (slug) => {
    expect(parseChannelSlug(slug)).toEqual({ ok: false, error: "reserved" });
  });
});

describe("candidats dérivés du nom d'affichage (ADR 0035 §3)", () => {
  it("propose le nom normalisé, puis _2 à _9, puis le début de l'identifiant du compte", () => {
    expect(candidatesOf("Streamer de test")).toEqual([
      "streamer_de_test",
      ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `streamer_de_test_${n}`),
      "streamer_de_4f2a9c1e7b3d",
    ]);
  });

  it.each([
    ["retire les accents", "Élodie Café", "elodie_cafe"],
    ["regroupe les séparateurs et retire ceux des bords", "  --Jo__Hn!! ", "jo_hn"],
    ["garde les chiffres", "Gamer 2000", "gamer_2000"],
    ["coupe à 25 caractères sans souligné final", `${"a".repeat(24)} b`, "a".repeat(24)],
  ])("%s", (_name, displayName, expected) => {
    expect(candidatesOf(displayName)[0]).toBe(expected);
  });

  it.each(["", "!!!", "李小龙"])("part de user pour un nom sans lettre latine (%j)", (name) => {
    expect(candidatesOf(name)[0]).toBe("user");
  });

  it("raccourcit la base pour que chaque suffixe tienne dans 25 caractères", () => {
    const candidates = candidatesOf("x".repeat(40));

    expect(candidates).toContain(`${"x".repeat(23)}_2`);
    expect(candidates).toContain(`${"x".repeat(12)}_4f2a9c1e7b3d`);
    expect(candidates.every((slug) => slug.length <= 25)).toBe(true);
  });

  it("garde au moins le candidat de l'identifiant du compte pour un nom d'une lettre", () => {
    expect(candidatesOf("A")).toEqual(["a_4f2a9c1e7b3d"]);
  });

  it("écarte les candidats réservés ou trop courts", () => {
    expect(candidatesOf("Admin")[0]).toBe("admin_2");
    expect(candidatesOf("Jo")[0]).toBe("jo_2");
  });

  it("donne les mêmes candidats pour le même event", () => {
    expect(candidatesOf("Streamer de test")).toEqual(candidatesOf("Streamer de test"));
  });
});

const streamerCandidates = () => slugCandidates({ displayName: "Streamer", accountId: ACCOUNT_ID });

describe("choix du slug", () => {
  it("retient le premier candidat libre", () => {
    expect(
      firstFreeSlug({
        candidates: streamerCandidates(),
        taken: new Set(["streamer", "streamer_2"]),
      }),
    ).toBe("streamer_3");
  });

  it("retient le premier candidat quand rien n'est pris", () => {
    expect(firstFreeSlug({ candidates: streamerCandidates(), taken: new Set() })).toBe("streamer");
  });

  it("ne retient rien quand tous les candidats sont pris", () => {
    const candidates = streamerCandidates();

    expect(firstFreeSlug({ candidates, taken: new Set(candidates.map(String)) })).toBeNull();
  });
});
