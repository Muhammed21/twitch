import { describe, expect, it } from "vitest";

import { MAX_TIMEOUT_SECONDS, parseTimeoutDuration, timeoutEnd } from "./timeout.ts";

const ISSUED_AT = new Date("2026-10-15T20:00:00.000Z");

describe("durée d'un timeout", () => {
  it.each([1, 600, 1_209_600])("accepte %i secondes", (seconds) => {
    expect(parseTimeoutDuration(seconds)).toEqual({ ok: true, value: seconds });
  });

  it("plafonne un timeout à 14 jours", () => {
    expect(MAX_TIMEOUT_SECONDS).toBe(14 * 24 * 60 * 60);
  });

  it.each([0, -1, 1_209_601, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuse %d secondes",
    (seconds) => {
      expect(parseTimeoutDuration(seconds)).toEqual({ ok: false, error: "invalid_duration" });
    },
  );
});

describe("fin d'un timeout", () => {
  it("tombe la durée après l'instant où il est donné", () => {
    const duration = parseTimeoutDuration(600);

    expect(duration.ok && timeoutEnd({ issuedAt: ISSUED_AT, duration: duration.value })).toEqual(
      new Date("2026-10-15T20:10:00.000Z"),
    );
  });
});
