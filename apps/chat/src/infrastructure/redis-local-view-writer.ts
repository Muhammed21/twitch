import { z } from "zod";

import type { LiveSession, LocalViewWriter } from "../application/ports.ts";
import {
  CHAT_COLOR,
  chatterKey,
  roomKey,
  sanctionsKey,
  toRoomState,
  TURBO_EXPIRES_AT,
} from "./redis-local-views.ts";

export type HashWriter = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  hSetNX(key: string, field: string, value: string): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
};

const ENDED_SESSIONS_TTL_SECONDS = 7 * 24 * 3600;

export const endedSessionsKey = (channelId: string): string => `chat:room:${channelId}:ended`;

const START_SESSION = `
if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 0 then
  redis.call('HSET', KEYS[1], 'sessionId', ARGV[1])
end
return redis.call('HGET', KEYS[1], 'sessionId')
`;

const END_SESSION = `
if redis.call('HGET', KEYS[1], 'sessionId') == ARGV[1] then
  redis.call('HSET', KEYS[1], 'sessionId', '')
end
redis.call('HSETNX', KEYS[1], 'sessionId', '')
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return redis.call('HGET', KEYS[1], 'sessionId')
`;

const SANCTION_CHATTER = `
local current = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
if tonumber(ARGV[2]) > current then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
end
redis.call('PEXPIREAT', KEYS[1], ARGV[2], 'NX')
redis.call('PEXPIREAT', KEYS[1], ARGV[2], 'GT')
return 1
`;

const CHANGE_AVATAR = `
local current = tonumber(redis.call('HGET', KEYS[1], 'avatarChangedAt') or '-1')
if tonumber(ARGV[2]) > current then
  redis.call('HSET', KEYS[1], 'avatarKey', ARGV[1], 'avatarChangedAt', ARGV[2])
end
return 1
`;

const CHANGE_IF_NEWER = `
local current = tonumber(redis.call('HGET', KEYS[1], ARGV[3]) or '-1')
if tonumber(ARGV[4]) > current then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2], ARGV[3], ARGV[4])
end
return 1
`;

const NONE = "";

const SessionReply = z.string();

const runSessionScript = async (
  redis: HashWriter,
  script: string,
  { channelId, sessionId }: LiveSession,
) => {
  const reply = await redis.eval(script, {
    keys: [roomKey(channelId), endedSessionsKey(channelId)],
    arguments: [sessionId, String(ENDED_SESSIONS_TTL_SECONDS)],
  });
  return toRoomState(channelId, SessionReply.parse(reply));
};

const changeIfNewer = async (
  redis: HashWriter,
  {
    userId,
    field,
    value,
    stampField,
    changedAt,
  }: { userId: string; field: string; value: string; stampField: string; changedAt: Date },
) => {
  await redis.eval(CHANGE_IF_NEWER, {
    keys: [chatterKey(userId)],
    arguments: [field, value, stampField, String(changedAt.getTime())],
  });
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
  changeAvatar: async ({ userId, avatarKey, changedAt }) => {
    await redis.eval(CHANGE_AVATAR, {
      keys: [chatterKey(userId)],
      arguments: [avatarKey, String(changedAt.getTime())],
    });
  },
  sanctionChatter: async ({ userId, channelId, expiresAt }) => {
    await redis.eval(SANCTION_CHATTER, {
      keys: [sanctionsKey(userId)],
      arguments: [channelId, String(expiresAt.getTime())],
    });
  },
  changeTurbo: ({ userId, expiresAt, changedAt }) =>
    changeIfNewer(redis, {
      userId,
      field: TURBO_EXPIRES_AT,
      stampField: "turboChangedAt",
      value: expiresAt === null ? NONE : String(expiresAt.getTime()),
      changedAt,
    }),
  changeChatColor: ({ userId, chatColor, changedAt }) =>
    changeIfNewer(redis, {
      userId,
      field: CHAT_COLOR,
      value: chatColor ?? NONE,
      stampField: "chatColorChangedAt",
      changedAt,
    }),
});
