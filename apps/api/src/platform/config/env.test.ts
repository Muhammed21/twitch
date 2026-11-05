import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.ts";

const HEALTH_URL = "postgresql://app_health:secret@127.0.0.1:5432/app";

const AUTH_SECRET = "s".repeat(32);

const WEBHOOK_SECRET = "w".repeat(32);

const SERVICE_SECRET = "v".repeat(32);

const VIDEO_SERVICE = {
  VIDEO_PROVIDER: "video",
  VIDEO_SERVICE_URL: "http://127.0.0.1:3002",
  VIDEO_SERVICE_SECRET: SERVICE_SECRET,
};

const POSTHOG = {
  FEATURE_FLAGS_PROVIDER: "posthog",
  POSTHOG_HOST: "https://eu.i.posthog.com",
  POSTHOG_PROJECT_API_KEY: "phc_cle_de_projet",
};

const makeEnv = (overrides: Record<string, string | undefined> = {}) => ({
  DATABASE_URL_HEALTH: HEALTH_URL,
  BETTER_AUTH_SECRET: AUTH_SECRET,
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  REDIS_URL: "redis://127.0.0.1:6379",
  VIDEO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  VIDEO_PLAYBACK_BASE_URL: "http://127.0.0.1:3002",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  VIDEO_PROVIDER: "fake",
  FEATURE_FLAGS_PROVIDER: "defaults",
  MOBILE_MIN_SUPPORTED_VERSION: "1.4.0",
  API_TRUSTED_PROXY_COUNT: "0",
  S3_ENDPOINT: "http://s3:8333",
  S3_REGION: "us-east-1",
  S3_BUCKET: "twitch-local",
  S3_ACCESS_KEY_ID: "dev_access_key",
  S3_SECRET_ACCESS_KEY: "dev_secret_key",
  S3_PUBLIC_BASE_URL: "http://127.0.0.1:8333/twitch-local",
  ...overrides,
});

const S3_STORAGE = {
  endpoint: "http://s3:8333",
  publicEndpoint: "http://s3:8333",
  region: "us-east-1",
  bucket: "twitch-local",
  accessKeyId: "dev_access_key",
  secretAccessKey: "dev_secret_key",
  publicBaseUrl: "http://127.0.0.1:8333/twitch-local",
};

describe("loadEnv", () => {
  it("lit la configuration, avec le port 3000 par défaut", () => {
    expect(loadEnv(makeEnv())).toEqual({
      port: 3000,
      databaseUrlHealth: HEALTH_URL,
      authSecret: AUTH_SECRET,
      authBaseUrl: "http://127.0.0.1:3000",
      redisUrl: "redis://127.0.0.1:6379",
      videoWebhookSecret: WEBHOOK_SECRET,
      videoPlaybackBaseUrl: "http://127.0.0.1:3002",
      smtp: { host: "127.0.0.1", port: 1025, from: "Twitch <no-reply@twitch.local>" },
      video: { provider: "fake" },
      featureFlags: { provider: "defaults" },
      mobileMinSupportedVersion: "1.4.0",
      trustedProxyCount: 0,
      images: S3_STORAGE,
      revenueCat: { webhookAuthorization: undefined },
    });
  });

  it("lit la valeur attendue de l'en-tête Authorization du webhook RevenueCat", () => {
    expect(
      loadEnv(
        makeEnv({ REVENUECAT_WEBHOOK_AUTHORIZATION: "Bearer valeur-choisie-dans-revenuecat" }),
      ).revenueCat,
    ).toEqual({ webhookAuthorization: "Bearer valeur-choisie-dans-revenuecat" });
  });

  it("traite une valeur vide de l'en-tête du webhook RevenueCat comme absente", () => {
    expect(loadEnv(makeEnv({ REVENUECAT_WEBHOOK_AUTHORIZATION: "" })).revenueCat).toEqual({
      webhookAuthorization: undefined,
    });
  });

  it("présigne les dépôts sur l'adresse publique du stockage quand elle diffère", () => {
    expect(loadEnv(makeEnv({ S3_PUBLIC_ENDPOINT: "http://127.0.0.1:8333" })).images).toEqual({
      ...S3_STORAGE,
      publicEndpoint: "http://127.0.0.1:8333",
    });
  });

  it.each([
    ["S3_ENDPOINT", undefined],
    ["S3_ENDPOINT", "s3:8333"],
    ["S3_ENDPOINT", "xhttp://s3:8333"],
    ["S3_ENDPOINT", "httpx://s3:8333"],
    ["S3_PUBLIC_ENDPOINT", "pas une url"],
    ["S3_PUBLIC_ENDPOINT", "ftp://127.0.0.1:8333"],
    ["S3_PUBLIC_ENDPOINT", "xhttp://127.0.0.1:8333"],
    ["S3_PUBLIC_ENDPOINT", "httpx://127.0.0.1:8333"],
    ["S3_REGION", ""],
    ["S3_BUCKET", ""],
    ["S3_ACCESS_KEY_ID", ""],
    ["S3_SECRET_ACCESS_KEY", ""],
    ["S3_PUBLIC_BASE_URL", undefined],
    ["S3_PUBLIC_BASE_URL", "ftp://images.twitch.test"],
    ["S3_PUBLIC_BASE_URL", "xhttps://images.twitch.test"],
    ["S3_PUBLIC_BASE_URL", "httpsx://images.twitch.test"],
  ])("refuse %s à %j en la nommant", (name, value) => {
    expect(() => loadEnv(makeEnv({ [name]: value }))).toThrow(name);
  });

  it("lit le nombre de proxys de confiance devant l'API", () => {
    expect(loadEnv(makeEnv({ API_TRUSTED_PROXY_COUNT: "2" })).trustedProxyCount).toBe(2);
  });

  it.each([undefined, "", " ", "-1", "1.5", "un", "0x1", "11"])(
    "refuse API_TRUSTED_PROXY_COUNT %j en la nommant",
    (count) => {
      expect(() => loadEnv(makeEnv({ API_TRUSTED_PROXY_COUNT: count }))).toThrow(
        "API_TRUSTED_PROXY_COUNT",
      );
    },
  );

  it("accepte jusqu'à 10 proxys de confiance", () => {
    expect(loadEnv(makeEnv({ API_TRUSTED_PROXY_COUNT: "10" })).trustedProxyCount).toBe(10);
  });

  it("lit l'hôte et la clé de projet PostHog quand PostHog évalue les flags", () => {
    expect(loadEnv(makeEnv(POSTHOG)).featureFlags).toEqual({
      provider: "posthog",
      host: "https://eu.i.posthog.com",
      apiKey: "phc_cle_de_projet",
    });
  });

  it.each([undefined, "", "PostHog", "launchdarkly"])(
    "refuse FEATURE_FLAGS_PROVIDER %j en la nommant",
    (provider) => {
      expect(() => loadEnv(makeEnv({ FEATURE_FLAGS_PROVIDER: provider }))).toThrow(
        "FEATURE_FLAGS_PROVIDER",
      );
    },
  );

  it("accepte un hôte PostHog en http, pour une instance locale", () => {
    expect(
      loadEnv(makeEnv({ ...POSTHOG, POSTHOG_HOST: "http://127.0.0.1:8000" })).featureFlags,
    ).toMatchObject({ host: "http://127.0.0.1:8000" });
  });

  it.each([undefined, "", "pas une url", "ftp://h", "xhttps://h", "https2://h"])(
    "refuse POSTHOG_HOST %j en la nommant, quand PostHog évalue les flags",
    (host) => {
      expect(() => loadEnv(makeEnv({ ...POSTHOG, POSTHOG_HOST: host }))).toThrow("POSTHOG_HOST");
    },
  );

  it.each([undefined, ""])(
    "refuse POSTHOG_PROJECT_API_KEY %j en la nommant, quand PostHog évalue les flags",
    (key) => {
      expect(() => loadEnv(makeEnv({ ...POSTHOG, POSTHOG_PROJECT_API_KEY: key }))).toThrow(
        "POSTHOG_PROJECT_API_KEY",
      );
    },
  );

  it.each([undefined, "", "1.4", "v1.4.0", "1.4.0-beta", "1.4.x"])(
    "refuse MOBILE_MIN_SUPPORTED_VERSION %j en la nommant",
    (version) => {
      expect(() => loadEnv(makeEnv({ MOBILE_MIN_SUPPORTED_VERSION: version }))).toThrow(
        "MOBILE_MIN_SUPPORTED_VERSION",
      );
    },
  );

  it("accepte une version minimale à plusieurs chiffres par composant", () => {
    expect(
      loadEnv(makeEnv({ MOBILE_MIN_SUPPORTED_VERSION: "10.12.103" })).mobileMinSupportedVersion,
    ).toBe("10.12.103");
  });

  it("lit l'adresse et le secret du service vidéo quand il est choisi", () => {
    expect(loadEnv(makeEnv(VIDEO_SERVICE)).video).toEqual({
      provider: "video",
      serviceUrl: "http://127.0.0.1:3002",
      serviceSecret: SERVICE_SECRET,
    });
  });

  it.each([undefined, "", "ivs", "FAKE"])("refuse VIDEO_PROVIDER %j en la nommant", (provider) => {
    expect(() => loadEnv(makeEnv({ VIDEO_PROVIDER: provider }))).toThrow("VIDEO_PROVIDER");
  });

  it.each([undefined, "", "pas une url", "ftp://h", "xhttp://h"])(
    "refuse VIDEO_SERVICE_URL %j en la nommant, quand le service vidéo est choisi",
    (url) => {
      expect(() => loadEnv(makeEnv({ ...VIDEO_SERVICE, VIDEO_SERVICE_URL: url }))).toThrow(
        "VIDEO_SERVICE_URL",
      );
    },
  );

  it.each([undefined, "", "v".repeat(31)])(
    "refuse VIDEO_SERVICE_SECRET %j en la nommant, quand le service vidéo est choisi",
    (secret) => {
      expect(() => loadEnv(makeEnv({ ...VIDEO_SERVICE, VIDEO_SERVICE_SECRET: secret }))).toThrow(
        "VIDEO_SERVICE_SECRET",
      );
    },
  );

  it("accepte une URL https du service vidéo", () => {
    expect(
      loadEnv(makeEnv({ ...VIDEO_SERVICE, VIDEO_SERVICE_URL: "https://video.internal" })).video,
    ).toMatchObject({ serviceUrl: "https://video.internal" });
  });

  it("lit l'expéditeur des e-mails", () => {
    expect(loadEnv(makeEnv({ SMTP_FROM: "Twitch <hello@twitch.example>" })).smtp.from).toBe(
      "Twitch <hello@twitch.example>",
    );
  });

  it.each([undefined, ""])("refuse SMTP_HOST %j en la nommant", (host) => {
    expect(() => loadEnv(makeEnv({ SMTP_HOST: host }))).toThrow("SMTP_HOST");
  });

  it.each([undefined, "0", "65536", "abc"])("refuse SMTP_PORT %j en la nommant", (port) => {
    expect(() => loadEnv(makeEnv({ SMTP_PORT: port }))).toThrow("SMTP_PORT");
  });

  it("lit le port", () => {
    expect(loadEnv(makeEnv({ API_PORT: "8080" })).port).toBe(8080);
  });

  it.each(["0", "65536", "abc", "80.5", ""])("refuse le port %j en nommant API_PORT", (port) => {
    expect(() => loadEnv(makeEnv({ API_PORT: port }))).toThrow("API_PORT");
  });

  it.each([undefined, "", "mysql://h/app", "pas une url"])(
    "refuse DATABASE_URL_HEALTH %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ DATABASE_URL_HEALTH: url }))).toThrow("DATABASE_URL_HEALTH");
    },
  );

  it("nomme toutes les variables invalides à la fois", () => {
    expect(() => loadEnv({ API_PORT: "abc" })).toThrow(
      "Configuration invalide, variables à corriger : API_PORT, DATABASE_URL_HEALTH, BETTER_AUTH_SECRET, BETTER_AUTH_URL, REDIS_URL, VIDEO_WEBHOOK_SECRET, VIDEO_PLAYBACK_BASE_URL, SMTP_HOST, SMTP_PORT, MOBILE_MIN_SUPPORTED_VERSION, API_TRUSTED_PROXY_COUNT, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL, VIDEO_PROVIDER, FEATURE_FLAGS_PROVIDER",
    );
  });

  it.each([undefined, "", "trop-court"])("refuse BETTER_AUTH_SECRET %j en la nommant", (secret) => {
    expect(() => loadEnv(makeEnv({ BETTER_AUTH_SECRET: secret }))).toThrow("BETTER_AUTH_SECRET");
  });

  it.each([undefined, "", "w".repeat(31)])(
    "refuse VIDEO_WEBHOOK_SECRET %j en la nommant",
    (secret) => {
      expect(() => loadEnv(makeEnv({ VIDEO_WEBHOOK_SECRET: secret }))).toThrow(
        "VIDEO_WEBHOOK_SECRET",
      );
    },
  );

  it.each([undefined, "", "pas une url", "ftp://h", "xhttp://h", "https2://h"])(
    "refuse VIDEO_PLAYBACK_BASE_URL %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ VIDEO_PLAYBACK_BASE_URL: url }))).toThrow(
        "VIDEO_PLAYBACK_BASE_URL",
      );
    },
  );

  it("accepte une base de lecture https", () => {
    expect(
      loadEnv(makeEnv({ VIDEO_PLAYBACK_BASE_URL: "https://video.example.test/live" }))
        .videoPlaybackBaseUrl,
    ).toBe("https://video.example.test/live");
  });

  it.each([undefined, "", "pas une url", "ftp://h", "xhttp://h", "https2://h"])(
    "refuse BETTER_AUTH_URL %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ BETTER_AUTH_URL: url }))).toThrow("BETTER_AUTH_URL");
    },
  );

  it.each([undefined, "", "pas une url", "http://h:6379", "xredis://h", "redis2://h"])(
    "refuse REDIS_URL %j en la nommant",
    (url) => {
      expect(() => loadEnv(makeEnv({ REDIS_URL: url }))).toThrow("REDIS_URL");
    },
  );

  it("accepte une URL rediss:// chiffrée", () => {
    expect(loadEnv(makeEnv({ REDIS_URL: "rediss://h:6380" })).redisUrl).toBe("rediss://h:6380");
  });

  it("accepte une URL postgres:// courte", () => {
    expect(loadEnv(makeEnv({ DATABASE_URL_HEALTH: "postgres://h/app" })).databaseUrlHealth).toBe(
      "postgres://h/app",
    );
  });

  it.each(["xpostgresql://h/app", "postgresql://h/app avec espace"])(
    "refuse l'URL mal ancrée %j",
    (url) => {
      expect(() => loadEnv(makeEnv({ DATABASE_URL_HEALTH: url }))).toThrow("DATABASE_URL_HEALTH");
    },
  );

  it("ne recopie jamais la valeur d'une variable dans l'erreur", () => {
    const failure = (() => {
      try {
        loadEnv(makeEnv({ DATABASE_URL_HEALTH: "valeur-confidentielle-42" }));
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
      return "aucune erreur";
    })();

    expect(failure).toContain("DATABASE_URL_HEALTH");
    expect(failure).not.toContain("valeur-confidentielle-42");
  });
});
