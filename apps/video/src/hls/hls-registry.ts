import { err, ok, type Result } from "@repo/result";

import {
  endHlsStream,
  feedHlsStream,
  type HlsStream,
  type HlsStreamOptions,
  type HlsStreamRefusal,
  startHlsStream,
} from "./hls-stream.ts";

export type HlsRegistry = {
  readonly open: (sessionId: string) => void;
  readonly feed: (
    sessionId: string,
    chunk: Uint8Array,
  ) => Result<void, HlsStreamRefusal | "unknown_session">;
  readonly end: (sessionId: string) => void;
  readonly remove: (sessionId: string) => void;
  readonly find: (sessionId: string) => HlsStream | undefined;
};

export const createHlsRegistry = (options: HlsStreamOptions): HlsRegistry => {
  const streams = new Map<string, HlsStream>();
  return {
    open: (sessionId) => {
      streams.set(sessionId, startHlsStream(options));
    },
    feed: (sessionId, chunk) => {
      const stream = streams.get(sessionId);
      if (stream === undefined) {
        return err("unknown_session");
      }
      const fed = feedHlsStream(stream, chunk);
      if (!fed.ok) {
        return fed;
      }
      streams.set(sessionId, fed.value);
      return ok(undefined);
    },
    end: (sessionId) => {
      const stream = streams.get(sessionId);
      if (stream !== undefined) {
        streams.set(sessionId, endHlsStream(stream));
      }
    },
    remove: (sessionId) => {
      streams.delete(sessionId);
    },
    find: (sessionId) => streams.get(sessionId),
  };
};
