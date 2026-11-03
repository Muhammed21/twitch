import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { blockingRequestOf, isTooFarAhead, partOf, satisfies } from "./blocking.ts";

const makeView = ({
  nextSequence,
  openParts = 0,
  closedParts = 2,
}: {
  readonly nextSequence: number;
  readonly openParts?: number;
  readonly closedParts?: number;
}) => {
  const makeParts = (count: number, seed: number) =>
    Array.from({ length: count }, (_, index) => ({
      seconds: 0.4,
      independent: index === 0,
      bytes: Uint8Array.of(seed, index),
    }));
  return {
    segments: Array.from({ length: nextSequence }, (_, sequence) => ({
      sequence,
      parts: makeParts(closedParts, sequence),
    })),
    open: { sequence: nextSequence, parts: makeParts(openParts, nextSequence) },
  };
};

describe("demande de rechargement bloquant", () => {
  it("n'en voit aucune sans paramètre _HLS_", () => {
    expect(blockingRequestOf(new URLSearchParams())).toEqual(ok(undefined));
  });

  it("lit le segment et la part demandés", () => {
    expect(blockingRequestOf(new URLSearchParams("_HLS_msn=12&_HLS_part=3"))).toEqual(
      ok({ msn: 12, part: 3 }),
    );
    expect(blockingRequestOf(new URLSearchParams("_HLS_msn=0"))).toEqual(
      ok({ msn: 0, part: undefined }),
    );
  });

  it.each([
    "_HLS_part=1",
    "_HLS_msn=-1",
    "_HLS_msn=1.5",
    "_HLS_msn=abc",
    "_HLS_msn=",
    "_HLS_msn=1&_HLS_part=x",
    "_HLS_msn=1e3",
  ])("refuse %s", (query) => {
    expect(blockingRequestOf(new URLSearchParams(query))).toEqual(err("invalid"));
  });
});

describe("demande trop loin dans le futur", () => {
  it("refuse un segment au-delà du segment ouvert plus deux", () => {
    const view = makeView({ nextSequence: 5 });

    expect(isTooFarAhead(view, { msn: 7, part: undefined })).toBe(false);
    expect(isTooFarAhead(view, { msn: 8, part: undefined })).toBe(true);
  });
});

describe("demande satisfaite", () => {
  it("par la fermeture du segment demandé", () => {
    const view = makeView({ nextSequence: 5 });

    expect(satisfies(view, { msn: 4, part: undefined })).toBe(true);
    expect(satisfies(view, { msn: 5, part: undefined })).toBe(false);
  });

  it("par la part demandée du segment ouvert, ou par la fermeture de ce segment", () => {
    const view = makeView({ nextSequence: 5, openParts: 2 });

    expect(satisfies(view, { msn: 5, part: 1 })).toBe(true);
    expect(satisfies(view, { msn: 5, part: 2 })).toBe(false);
    expect(satisfies(view, { msn: 4, part: 9 })).toBe(true);
    expect(satisfies(view, { msn: 6, part: 0 })).toBe(false);
  });
});

describe("part demandée", () => {
  it("se trouve dans un segment fermé ou dans le segment ouvert", () => {
    const view = makeView({ nextSequence: 3, openParts: 1 });

    expect(partOf(view, 1, 1)?.bytes).toEqual(Uint8Array.of(1, 1));
    expect(partOf(view, 3, 0)?.bytes).toEqual(Uint8Array.of(3, 0));
    expect(partOf(view, 1, 2)).toBeUndefined();
    expect(partOf(view, 3, 1)).toBeUndefined();
    expect(partOf(view, 4, 0)).toBeUndefined();
  });
});
