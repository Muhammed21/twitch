import { describe, expect, it } from "vitest";

import { err } from "@repo/result";

import { parseAccountId } from "./account-id.ts";

const VALID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

describe("AccountId", () => {
  it("accepte un UUID et le normalise en minuscules", () => {
    const parsed = parseAccountId(VALID.toUpperCase());

    expect(parsed.ok && parsed.value).toBe(VALID);
  });

  it.each(["", "4f2a9c1e", `${VALID}0`, ` ${VALID}`, "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9g"])(
    "refuse l'identifiant mal formé %j",
    (value) => {
      expect(parseAccountId(value)).toEqual(err("invalid_account_id"));
    },
  );
});
