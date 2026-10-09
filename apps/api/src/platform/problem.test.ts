import { describe, expect, it } from "vitest";
import { z } from "zod";

import { InvalidRequestException, toInvalidRequest } from "./problem.ts";

describe("toInvalidRequest", () => {
  it("fait d'une erreur Zod une requête invalide, avec ses chemins", () => {
    const error = z.object({ title: z.string() }).safeParse({}).error;

    expect(toInvalidRequest(error)).toBeInstanceOf(InvalidRequestException);
  });

  it("ne prend pas une autre erreur pour une requête invalide", () => {
    const converted = toInvalidRequest(new Error("autre chose"));

    expect(converted).not.toBeInstanceOf(InvalidRequestException);
    expect(converted.message).toBe("Validation impossible : erreur de validation inattendue");
  });
});
