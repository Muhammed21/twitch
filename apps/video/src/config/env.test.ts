import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const failureOf = (load: () => unknown): string => {
  try {
    load();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "aucune erreur";
};

const SERVICE_SECRET = "s".repeat(32);
const ENCRYPTION_KEY = Buffer.alloc(32, 7);

const WEBHOOK_SECRET = "w".repeat(32);
const RELAY_DATABASE_URL = "postgresql://app_outbox_relay:secret@127.0.0.1:5432/app";

const makeEnv = (overrides: Record<string, string> = {}) => ({
  VIDEO_SERVICE_SECRET: SERVICE_SECRET,
  VIDEO_STREAM_KEY_ENCRYPTION_KEY: ENCRYPTION_KEY.toString("base64"),
  VIDEO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  DATABASE_URL_OUTBOX_RELAY: RELAY_DATABASE_URL,
  ...overrides,
});

const envWithout = (variable: string) =>
  Object.fromEntries(Object.entries(makeEnv()).filter(([name]) => name !== variable));

describe("loadEnv", () => {
  it("écoute en HTTP sur 3002 et en RTMP sur 1935, annonce l'ingest local et relaie vers l'API locale par défaut", () => {
    expect(loadEnv(makeEnv())).toEqual({
      httpPort: 3002,
      rtmpPort: 1935,
      serviceSecret: SERVICE_SECRET,
      ingestUrl: "rtmp://127.0.0.1:1935/live",
      streamKeyEncryptionKey: Uint8Array.from(ENCRYPTION_KEY),
      webhook: { url: "http://127.0.0.1:3000/v1/webhooks/video", secret: WEBHOOK_SECRET },
      outboxRelay: { databaseUrl: RELAY_DATABASE_URL, intervalMs: 1000 },
    });
  });

  it.each(["https://api.example/v1/webhooks/video", "http://api:3000/v1/webhooks/video"])(
    "lit l'URL des webhooks %s",
    (url) => {
      expect(loadEnv(makeEnv({ VIDEO_WEBHOOK_URL: url })).webhook.url).toBe(url);
    },
  );

  it.each(["rtmp://api.example/hook", "xhttp://api.example/hook", "httpx://api.example/hook", ""])(
    "refuse l'URL des webhooks %j en nommant VIDEO_WEBHOOK_URL",
    (url) => {
      expect(failureOf(() => loadEnv(makeEnv({ VIDEO_WEBHOOK_URL: url })))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_WEBHOOK_URL",
      );
    },
  );

  it("accepte un secret de webhook de 32 caractères, refuse 31", () => {
    expect(loadEnv(makeEnv({ VIDEO_WEBHOOK_SECRET: "x".repeat(32) })).webhook.secret).toBe(
      "x".repeat(32),
    );
    expect(failureOf(() => loadEnv(makeEnv({ VIDEO_WEBHOOK_SECRET: "x".repeat(31) })))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_WEBHOOK_SECRET",
    );
  });

  it.each([
    "VIDEO_SERVICE_SECRET",
    "VIDEO_STREAM_KEY_ENCRYPTION_KEY",
    "VIDEO_WEBHOOK_SECRET",
    "DATABASE_URL_OUTBOX_RELAY",
  ])("exige %s", (variable) => {
    expect(failureOf(() => loadEnv(envWithout(variable)))).toBe(
      `Configuration invalide, variables à corriger : ${variable}`,
    );
  });

  it.each(["postgres://u:p@h/app", "postgresql://u:p@h:5432/app"])(
    "lit la connexion du relais %s",
    (url) => {
      expect(loadEnv(makeEnv({ DATABASE_URL_OUTBOX_RELAY: url })).outboxRelay.databaseUrl).toBe(
        url,
      );
    },
  );

  it.each(["mysql://u:p@h/app", "xpostgres://u:p@h/app", "postgres://u:p@h/app x"])(
    "refuse la connexion du relais %j en nommant DATABASE_URL_OUTBOX_RELAY",
    (url) => {
      expect(failureOf(() => loadEnv(makeEnv({ DATABASE_URL_OUTBOX_RELAY: url })))).toBe(
        "Configuration invalide, variables à corriger : DATABASE_URL_OUTBOX_RELAY",
      );
    },
  );

  it("lit l'intervalle du relais, d'au moins 1 ms", () => {
    expect(loadEnv(makeEnv({ OUTBOX_RELAY_INTERVAL_MS: "1" })).outboxRelay.intervalMs).toBe(1);
    expect(failureOf(() => loadEnv(makeEnv({ OUTBOX_RELAY_INTERVAL_MS: "0" })))).toBe(
      "Configuration invalide, variables à corriger : OUTBOX_RELAY_INTERVAL_MS",
    );
    expect(failureOf(() => loadEnv(makeEnv({ OUTBOX_RELAY_INTERVAL_MS: "1.5" })))).toBe(
      "Configuration invalide, variables à corriger : OUTBOX_RELAY_INTERVAL_MS",
    );
  });

  it.each([
    ["0", 0],
    ["1936", 1936],
    ["65535", 65_535],
  ])("lit le port RTMP %s", (port, expected) => {
    expect(loadEnv(makeEnv({ VIDEO_RTMP_PORT: port })).rtmpPort).toBe(expected);
  });

  it.each(["-1", "65536", "19.5", "abc"])(
    "refuse le port RTMP %j en nommant VIDEO_RTMP_PORT",
    (port) => {
      expect(failureOf(() => loadEnv(makeEnv({ VIDEO_RTMP_PORT: port })))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_RTMP_PORT",
      );
    },
  );

  it("lit le port HTTP", () => {
    expect(loadEnv(makeEnv({ VIDEO_HTTP_PORT: "8080" })).httpPort).toBe(8080);
  });

  it.each(["rtmp://ingest.example/live", "rtmps://ingest.example:443/live"])(
    "lit l'URL d'ingest %s",
    (url) => {
      expect(loadEnv(makeEnv({ VIDEO_INGEST_URL: url })).ingestUrl).toBe(url);
    },
  );

  it.each([
    "https://ingest.example/live",
    "xrtmp://ingest.example/live",
    "rtmpx://ingest.example/live",
    "pas-une-url",
    "",
  ])("refuse l'URL d'ingest %j en nommant VIDEO_INGEST_URL", (url) => {
    expect(failureOf(() => loadEnv(makeEnv({ VIDEO_INGEST_URL: url })))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_INGEST_URL",
    );
  });

  it("nomme toutes les variables invalides", () => {
    expect(failureOf(() => loadEnv({ VIDEO_HTTP_PORT: "abc" }))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_HTTP_PORT, VIDEO_SERVICE_SECRET, VIDEO_STREAM_KEY_ENCRYPTION_KEY, VIDEO_WEBHOOK_SECRET, DATABASE_URL_OUTBOX_RELAY",
    );
  });

  it.each([
    ["31 octets", Buffer.alloc(31, 7).toString("base64")],
    ["33 octets", Buffer.alloc(33, 7).toString("base64")],
    ["de l'hexadécimal de 32 octets", Buffer.alloc(32, 7).toString("hex")],
    ["du texte qui n'est pas du base64", "pas du base64 !"],
    ["une valeur vide", ""],
  ])(
    "refuse une clé de chiffrement de %s en nommant VIDEO_STREAM_KEY_ENCRYPTION_KEY",
    (_, value) => {
      expect(failureOf(() => loadEnv(makeEnv({ VIDEO_STREAM_KEY_ENCRYPTION_KEY: value })))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_STREAM_KEY_ENCRYPTION_KEY",
      );
    },
  );

  it("accepte un secret de service de 32 caractères, refuse 31", () => {
    expect(loadEnv(makeEnv({ VIDEO_SERVICE_SECRET: "x".repeat(32) })).serviceSecret).toBe(
      "x".repeat(32),
    );
    expect(failureOf(() => loadEnv(makeEnv({ VIDEO_SERVICE_SECRET: "x".repeat(31) })))).toBe(
      "Configuration invalide, variables à corriger : VIDEO_SERVICE_SECRET",
    );
  });

  it.each([
    ["1", 1],
    ["65535", 65_535],
  ])("accepte le port limite %s", (port, expected) => {
    expect(loadEnv(makeEnv({ VIDEO_HTTP_PORT: port })).httpPort).toBe(expected);
  });

  it.each(["0", "65536", "-1", "-1.5", "abc", "80.5", ""])(
    "refuse le port %j en nommant VIDEO_HTTP_PORT",
    (port) => {
      expect(failureOf(() => loadEnv(makeEnv({ VIDEO_HTTP_PORT: port })))).toBe(
        "Configuration invalide, variables à corriger : VIDEO_HTTP_PORT",
      );
    },
  );

  it("ne recopie jamais la valeur d'une variable dans l'erreur", () => {
    const failure = failureOf(() =>
      loadEnv({
        VIDEO_HTTP_PORT: "valeur-confidentielle-42",
        VIDEO_SERVICE_SECRET: "court",
        DATABASE_URL_OUTBOX_RELAY: "mysql://confidentiel",
      }),
    );

    expect(failure).toContain("VIDEO_HTTP_PORT");
    expect(failure).not.toContain("valeur-confidentielle-42");
    expect(failure).not.toContain("court");
    expect(failure).not.toContain("mysql");
  });
});
