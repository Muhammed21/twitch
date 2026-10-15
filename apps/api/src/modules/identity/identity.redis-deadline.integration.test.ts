import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { settledWithin, withPausedRedis } from "../../platform/testing/paused-redis.ts";
import {
  createIdentityRedis,
  redisRevokedSessionList,
  redisRevokedSessions,
  redisSessionRevocationBroadcast,
} from "./infrastructure/redis-session-revocation.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const REDIS_URL = urlOf("REDIS_URL");
const DEADLINE_WITH_MARGIN_MS = 2500;

const redis = createIdentityRedis(REDIS_URL);

const whilePaused = (run: () => Promise<unknown>) =>
  withPausedRedis(REDIS_URL, () => settledWithin(run, DEADLINE_WITH_MARGIN_MS));

const deadlineExceeded = {
  status: "rejected",
  reason: expect.objectContaining({ message: expect.stringContaining("2000 ms") }),
  inTime: true,
};

beforeAll(async () => {
  await redis.connect();
});

afterAll(() => {
  redis.destroy();
});

describe("identity : Redis qui ne répond plus en 2 s", () => {
  it("la lecture de la liste de révocation échoue, pour que le vérificateur la dise indisponible", async () => {
    expect(await whilePaused(() => redisRevokedSessions(redis).isRevoked(randomUUID()))).toEqual(
      deadlineExceeded,
    );
  });

  it("l'ajout à la liste de révocation échoue au lieu d'attendre", async () => {
    expect(
      await whilePaused(() =>
        redisRevokedSessionList(redis).add({ sids: [randomUUID()], ttlSeconds: 900 }),
      ),
    ).toEqual(deadlineExceeded);
  });

  it("la diffusion de la révocation échoue au lieu d'attendre", async () => {
    expect(
      await whilePaused(() =>
        redisSessionRevocationBroadcast(redis).publish({ userId: randomUUID(), sids: [] }),
      ),
    ).toEqual(deadlineExceeded);
  });

  it("la lecture de la liste de révocation répond quand Redis répond", async () => {
    const sid = randomUUID();
    await redisRevokedSessionList(redis).add({ sids: [sid], ttlSeconds: 900 });

    expect(await redisRevokedSessions(redis).isRevoked(sid)).toBe(true);
    expect(await redisRevokedSessions(redis).isRevoked(randomUUID())).toBe(false);
  });
});
