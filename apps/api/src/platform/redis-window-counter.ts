import { z } from "zod";

import type { WindowCounter } from "./rate-limit.ts";

const INCREMENT_WITH_EXPIRY = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return count
`;

const Count = z.int().positive();

export type EvalRedis = {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
};

export const redisWindowCounter =
  (redis: EvalRedis): WindowCounter =>
  async (key, ttlMs) =>
    Count.parse(
      await redis.eval(INCREMENT_WITH_EXPIRY, { keys: [key], arguments: [String(ttlMs)] }),
    );
