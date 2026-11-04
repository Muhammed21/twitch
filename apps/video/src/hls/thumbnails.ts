import { err, ok, type Result } from "@repo/result";

import { concatBytes } from "../segmenter/bytes.ts";
import type { HlsStream } from "./hls-stream.ts";

export type FrameExtractor = (fmp4: Uint8Array) => Promise<Uint8Array | undefined>;

export type ThumbnailRefusal = "not_ready" | "failed" | "busy";

export type Thumbnail = Result<Uint8Array, ThumbnailRefusal>;

export type Thumbnails = {
  readonly of: (sessionId: string, stream: HlsStream) => Promise<Thumbnail>;
  readonly size: () => number;
};

type Entry = { readonly result: Promise<Thumbnail>; settledAt: number | undefined };

export const createThumbnails = ({
  extract,
  ttlMs,
  maxConcurrent,
  now,
}: {
  readonly extract: FrameExtractor;
  readonly ttlMs: number;
  readonly maxConcurrent: number;
  readonly now: () => number;
}): Thumbnails => {
  const entries = new Map<string, Entry>();
  const isFresh = (entry: Entry, at: number) =>
    entry.settledAt === undefined || at - entry.settledAt < ttlMs;
  const forgetExpired = (at: number) => {
    for (const [sessionId, entry] of entries) {
      if (!isFresh(entry, at)) {
        entries.delete(sessionId);
      }
    }
  };
  const start = (fmp4: Uint8Array): Entry => {
    const entry: Entry = {
      settledAt: undefined,
      result: extract(fmp4)
        .catch(() => undefined)
        .then((bytes): Thumbnail => {
          entry.settledAt = now();
          return bytes === undefined ? err("failed") : ok(bytes);
        }),
    };
    return entry;
  };
  return {
    of: (sessionId, stream) => {
      forgetExpired(now());
      const last = stream.segments.at(-1);
      if (stream.init === undefined || last === undefined) {
        return Promise.resolve(err("not_ready"));
      }
      const cached = entries.get(sessionId);
      if (cached !== undefined) {
        return cached.result;
      }
      const running = [...entries.values()].filter(({ settledAt }) => settledAt === undefined);
      if (running.length >= maxConcurrent) {
        return Promise.resolve(err("busy"));
      }
      const entry = start(concatBytes(stream.init.bytes, last.bytes));
      entries.set(sessionId, entry);
      return entry.result;
    },
    size: () => entries.size,
  };
};
