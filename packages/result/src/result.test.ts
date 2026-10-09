import { describe, expect, it } from "vitest";

import { err, flatMap, map, mapError, match, ok, type Result } from "./index.ts";

type ParseError = "not_a_number" | "negative";

const parse = (input: string): Result<number, ParseError> =>
  Number.isNaN(Number(input)) ? err("not_a_number") : ok(Number(input));

const positive = (value: number): Result<number, ParseError> =>
  value < 0 ? err("negative") : ok(value);

const summary = (result: Result<number, ParseError>) =>
  match(result, { ok: (value) => `valeur ${value}`, err: (error) => `erreur ${error}` });

describe("Result", () => {
  it("porte une valeur ou une erreur", () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err("negative")).toEqual({ ok: false, error: "negative" });
  });

  it("transforme la valeur d'un succès, et laisse passer une erreur", () => {
    expect(map(parse("2"), (value) => value * 10)).toEqual(ok(20));
    expect(map(parse("x"), (value) => value * 10)).toEqual(err("not_a_number"));
  });

  it("transforme l'erreur d'un échec, et laisse passer un succès", () => {
    expect(mapError(parse("x"), (error) => `invalide : ${error}`)).toEqual(
      err("invalide : not_a_number"),
    );
    expect(mapError(parse("2"), (error) => `invalide : ${error}`)).toEqual(ok(2));
  });

  it("enchaîne des étapes qui peuvent échouer, en s'arrêtant à la première erreur", () => {
    expect(flatMap(parse("4"), positive)).toEqual(ok(4));
    expect(flatMap(parse("-4"), positive)).toEqual(err("negative"));
    expect(flatMap(parse("x"), positive)).toEqual(err("not_a_number"));
  });

  it("réduit un résultat à une seule valeur selon son issue", () => {
    expect(summary(parse("7"))).toBe("valeur 7");
    expect(summary(parse("x"))).toBe("erreur not_a_number");
  });
});
