import { z } from "zod";

import type { LiveSession, LocalViewWriter } from "../application/ports.ts";
import { chatterKey, roomKey, toRoomState } from "./redis-local-views.ts";

export type HashWriter = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  hSetNX(key: string, field: string, value: string): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
};

const START_SESSION = `
if redis.call('HGET', KEYS[1], 'endedSessionId') ~= ARGV[1] then
  redis.call('HSET', KEYS[1], 'sessionId', ARGV[1])
end
return redis.call('HGET', KEYS[1], 'sessionId')
`;

const END_SESSION = `
if redis.call('HGET', KEYS[1], 'sessionId') == ARGV[1] then
  redis.call('HSET', KEYS[1], 'sessionId', '')
end
redis.call('HSETNX', KEYS[1], 'sessionId', '')
redis.call('HSET', KEYS[1], 'endedSessionId', ARGV[1])
return redis.call('HGET', KEYS[1], 'sessionId')
`;

const SessionReply = z.string();

const runSessionScript = async (
  redis: HashWriter,
  script: string,
  { channelId, sessionId }: LiveSession,
) => {
  const reply = await redis.eval(script, { keys: [roomKey(channelId)], arguments: [sessionId] });
  return toRoomState(channelId, SessionReply.parse(reply));
};

export const redisLocalViewWriter = (redis: HashWriter): LocalViewWriter => ({
  openRoom: async (channelId) => {
    await redis.hSetNX(roomKey(channelId), "sessionId", "");
  },
  startSession: (session) => runSessionScript(redis, START_SESSION, session),
  endSession: (session) => runSessionScript(redis, END_SESSION, session),
  registerChatter: async ({ userId, displayName }) => {
    await redis.hSet(chatterKey(userId), "displayName", displayName);
  },
});
