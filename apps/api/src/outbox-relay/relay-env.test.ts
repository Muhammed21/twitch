import { describe, expect, it } from "vitest";

import { loadRelayEnv } from "./relay-env.ts";

const RELAY_URL = "postgresql://app_outbox_relay:secret@127.0.0.1:5432/app";

const makeEnv = (overrides: Record<string, string | undefined> = {}) => ({
  DATABASE_URL_OUTBOX_RELAY: RELAY_URL,
  REDIS_URL: "redis://127.0.0.1:6379",
  ...overrides,
});

describe("loadRelayEnv", () => {
  it("lit la configuration, avec un intervalle de 1 s par défaut", () => {
    expect(loadRelayEnv(makeEnv())).toEqual({
      databaseUrl: RELAY_URL,
      redisUrl: "redis://127.0.0.1:6379",
      intervalMs: 1000,
    });
  });

  it("lit l'intervalle entre deux passes", () => {
    expect(loadRelayEnv(makeEnv({ OUTBOX_RELAY_INTERVAL_MS: "250" })).intervalMs).toBe(250);
  });

  it.each(["0", "-1", "abc", "1.5", ""])(
    "refuse l'intervalle %j en nommant OUTBOX_RELAY_INTERVAL_MS",
    (interval) => {
      expect(() => loadRelayEnv(makeEnv({ OUTBOX_RELAY_INTERVAL_MS: interval }))).toThrow(
        "OUTBOX_RELAY_INTERVAL_MS",
      );
    },
  );

  it.each([
    undefined,
    "",
    "mysql://h/app",
    "xpostgresql://h/app",
    "postgresql://h/app avec espace",
  ])("refuse DATABASE_URL_OUTBOX_RELAY %j en la nommant", (url) => {
    expect(() => loadRelayEnv(makeEnv({ DATABASE_URL_OUTBOX_RELAY: url }))).toThrow(
      "DATABASE_URL_OUTBOX_RELAY",
    );
  });

  it.each([undefined, "", "http://h:6379", "xredis://h", "redis2://h"])(
    "refuse REDIS_URL %j en la nommant",
    (url) => {
      expect(() => loadRelayEnv(makeEnv({ REDIS_URL: url }))).toThrow("REDIS_URL");
    },
  );

  it("accepte une URL postgres:// courte et une URL rediss:// chiffrée", () => {
    expect(
      loadRelayEnv(
        makeEnv({ DATABASE_URL_OUTBOX_RELAY: "postgres://h/app", REDIS_URL: "rediss://h:6380" }),
      ),
    ).toMatchObject({ databaseUrl: "postgres://h/app", redisUrl: "rediss://h:6380" });
  });

  it("nomme toutes les variables invalides, sans recopier leur valeur", () => {
    expect(() => loadRelayEnv({ DATABASE_URL_OUTBOX_RELAY: "valeur-confidentielle-42" })).toThrow(
      /^Configuration invalide, variables à corriger : DATABASE_URL_OUTBOX_RELAY, REDIS_URL$/,
    );
  });
});
