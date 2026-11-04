import type { RateLimit } from "../application/ports.ts";
import { RATE_LIMIT } from "../domain/decide.ts";

export type ScriptRunner = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export const rateLimitKey = (userId: string): string => `chat:rate-limit:${userId}`;

const TAKE_TOKEN = `
local now = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local per_token = tonumber(ARGV[3])
local state = redis.call('HMGET', KEYS[1], 'tokens', 'refilledAt')
local tokens = burst
local refilled_at = now
if state[1] and state[2] then
  local previous = tonumber(state[2])
  tokens = math.min(burst, tonumber(state[1]) + math.max(0, now - previous) / per_token)
  refilled_at = math.max(now, previous)
end
if tokens < 1 then
  return 0
end
tokens = tokens - 1
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'refilledAt', tostring(refilled_at))
redis.call('PEXPIRE', KEYS[1], math.ceil((burst - tokens) * per_token))
return 1
`;

export const redisTokenBuckets = (redis: ScriptRunner): RateLimit => ({
  take: async ({ userId, now }) =>
    (await redis.eval(TAKE_TOKEN, {
      keys: [rateLimitKey(userId)],
      arguments: [
        String(now.getTime()),
        String(RATE_LIMIT.burst),
        String(RATE_LIMIT.millisecondsPerToken),
      ],
    })) === 1,
});
