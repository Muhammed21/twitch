import { err, ok, type Result } from "@repo/result";

import {
  endHlsStream,
  feedHlsStream,
  type HlsStream,
  type HlsStreamOptions,
  type HlsStreamRefusal,
  startHlsStream,
} from "./hls-stream.ts";

export type HlsFeedRefusal = HlsStreamRefusal | "unknown_session" | "ended";

export type HlsRegistry = {
  readonly open: (sessionId: string) => void;
  readonly feed: (sessionId: string, chunk: Uint8Array) => Result<void, HlsFeedRefusal>;
  readonly end: (sessionId: string) => void;
  readonly remove: (sessionId: string) => void;
  readonly find: (sessionId: string) => HlsStream | undefined;
  readonly waitFor: (
    sessionId: string,
    ready: (stream: HlsStream) => boolean,
    timeoutMs: number,
  ) => Promise<HlsStream | undefined>;
  readonly waiting: () => number;
};

export const createHlsRegistry = (options: HlsStreamOptions): HlsRegistry => {
  const streams = new Map<string, HlsStream>();
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const watcher of watchers) {
      watcher();
    }
  };
  const settled = (sessionId: string, ready: (stream: HlsStream) => boolean) => {
    const stream = streams.get(sessionId);
    return stream === undefined || stream.ended || ready(stream) ? { stream } : undefined;
  };
  return {
    open: (sessionId) => {
      streams.set(sessionId, startHlsStream(options));
    },
    feed: (sessionId, chunk) => {
      const stream = streams.get(sessionId);
      if (stream === undefined) {
        return err("unknown_session");
      }
      if (stream.ended) {
        return err("ended");
      }
      const fed = feedHlsStream(stream, chunk);
      if (!fed.ok) {
        return fed;
      }
      streams.set(sessionId, fed.value);
      changed();
      return ok(undefined);
    },
    end: (sessionId) => {
      const stream = streams.get(sessionId);
      if (stream !== undefined) {
        streams.set(sessionId, endHlsStream(stream));
        changed();
      }
    },
    remove: (sessionId) => {
      streams.delete(sessionId);
      changed();
    },
    find: (sessionId) => streams.get(sessionId),
    waitFor: (sessionId, ready, timeoutMs) => {
      const now = settled(sessionId, ready);
      if (now !== undefined) {
        return Promise.resolve(now.stream);
      }
      return new Promise((resolve) => {
        const finish = (stream: HlsStream | undefined) => {
          watchers.delete(watcher);
          clearTimeout(timer);
          resolve(stream);
        };
        const watcher = () => {
          const later = settled(sessionId, ready);
          if (later !== undefined) {
            finish(later.stream);
          }
        };
        const timer = setTimeout(() => finish(undefined), timeoutMs);
        watchers.add(watcher);
      });
    },
    waiting: () => watchers.size,
  };
};
