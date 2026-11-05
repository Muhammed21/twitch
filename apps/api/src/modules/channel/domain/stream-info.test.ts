import { describe, expect, it } from "vitest";

import {
  CHANNEL_LANGUAGES,
  CONTENT_LABELS,
  contentLabelsOf,
  MAX_CHANNEL_TAG_LENGTH,
  MAX_CHANNEL_TAGS,
  parseChannelTags,
} from "./stream-info.ts";

const tagsOf = (count: number) => Array.from({ length: count }, (_, index) => `tag${index}`);

describe("tags d'une chaîne", () => {
  it("compte au plus 10 tags de 25 caractères", () => {
    expect({ MAX_CHANNEL_TAGS, MAX_CHANNEL_TAG_LENGTH }).toEqual({
      MAX_CHANNEL_TAGS: 10,
      MAX_CHANNEL_TAG_LENGTH: 25,
    });
  });

  it("accepte une liste vide", () => {
    expect(parseChannelTags([])).toEqual({ ok: true, value: [] });
  });

  it("met les tags en minuscules sans accents ni espaces de bord, dans l'ordre", () => {
    expect(parseChannelTags([" Français ", "SpeedRun", "Ça"])).toEqual({
      ok: true,
      value: ["francais", "speedrun", "ca"],
    });
  });

  it("garde les chiffres et les lettres hors de l'alphabet latin", () => {
    expect(parseChannelTags(["fps2", "日本語"])).toEqual({ ok: true, value: ["fps2", "日本語"] });
  });

  it("accepte 10 tags", () => {
    expect(parseChannelTags(tagsOf(10))).toEqual({ ok: true, value: tagsOf(10) });
  });

  it("refuse 11 tags", () => {
    expect(parseChannelTags(tagsOf(11))).toEqual({ ok: false, error: "invalid_tags" });
  });

  it("accepte un tag de 25 caractères", () => {
    expect(parseChannelTags(["a".repeat(25)])).toEqual({ ok: true, value: ["a".repeat(25)] });
  });

  it("compte un caractère accentué pour un caractère", () => {
    expect(parseChannelTags(["é".normalize("NFD").repeat(25)])).toEqual({
      ok: true,
      value: ["e".repeat(25)],
    });
  });

  it.each([
    ["de 26 caractères", "a".repeat(26)],
    ["vide", "   "],
    ["avec une espace", "speed run"],
    ["avec un tiret", "speed-run"],
    ["avec un caractère spécial", "fps!"],
    ["avec un emoji", "jeu🎮"],
  ])("refuse un tag %s", (_name, tag) => {
    expect(parseChannelTags(["irl", tag])).toEqual({ ok: false, error: "invalid_tags" });
  });

  it("refuse deux tags égaux après normalisation", () => {
    expect(parseChannelTags(["Café", "cafe"])).toEqual({ ok: false, error: "invalid_tags" });
  });
});

describe("langue d'une chaîne", () => {
  it("vient de la liste fermée des langues du parcours de l'app", () => {
    expect(CHANNEL_LANGUAGES).toEqual([
      "en",
      "fr",
      "de",
      "es",
      "pt",
      "it",
      "ja",
      "ko",
      "zh",
      "ru",
      "pl",
      "tr",
    ]);
  });
});

describe("classification du contenu d'une chaîne", () => {
  it("vient de la liste fermée des descripteurs de l'app", () => {
    expect(CONTENT_LABELS).toEqual([
      "sexual_themes",
      "drugs_intoxication_tobacco",
      "gambling",
      "violent_graphic",
      "profanity",
      "mature_rated_games",
      "politics_sensitive",
    ]);
  });

  it("garde chaque descripteur une fois, dans l'ordre de la liste", () => {
    expect(contentLabelsOf(["profanity", "gambling", "profanity"])).toEqual([
      "gambling",
      "profanity",
    ]);
  });
});
