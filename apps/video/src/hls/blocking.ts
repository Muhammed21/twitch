import { err, ok, type Result } from "@repo/result";

import type { Part, Segment } from "../segmenter/segmenter.ts";

export type BlockingRequest = { readonly msn: number; readonly part: number | undefined };

export type PartsView = {
  readonly segments: readonly Pick<Segment, "sequence" | "parts">[];
  readonly open: { readonly sequence: number; readonly parts: readonly Part[] };
};

const MAX_SEGMENTS_AHEAD = 2;
const INTEGER = /^\d{1,15}$/;

const integerOf = (value: string | null): Result<number | undefined, "invalid"> => {
  if (value === null) {
    return ok(undefined);
  }
  return INTEGER.test(value) ? ok(Number(value)) : err("invalid");
};

export const blockingRequestOf = (
  query: URLSearchParams,
): Result<BlockingRequest | undefined, "invalid"> => {
  const msn = integerOf(query.get("_HLS_msn"));
  if (!msn.ok) {
    return msn;
  }
  const part = integerOf(query.get("_HLS_part"));
  if (!part.ok) {
    return part;
  }
  if (msn.value === undefined) {
    return part.value === undefined ? ok(undefined) : err("invalid");
  }
  return ok({ msn: msn.value, part: part.value });
};

export const isTooFarAhead = (view: PartsView, request: BlockingRequest): boolean =>
  request.msn > view.open.sequence + MAX_SEGMENTS_AHEAD;

export const satisfies = (view: PartsView, request: BlockingRequest): boolean =>
  request.msn < view.open.sequence ||
  (request.part !== undefined &&
    request.msn === view.open.sequence &&
    request.part < view.open.parts.length);

export const partOf = (view: PartsView, sequence: number, index: number): Part | undefined =>
  sequence === view.open.sequence
    ? view.open.parts[index]
    : view.segments.find((segment) => segment.sequence === sequence)?.parts[index];
