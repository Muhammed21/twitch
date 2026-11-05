import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { responses } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { buildOpenApiDocument } from "../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import type { FeatureFlags, FindOwnedChannel, ReadProfile } from "./application/read-bootstrap.ts";
import { MobileModule } from "./mobile.module.ts";

const USER_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const VALID_TOKEN = "jeton-valide";

const INVALID_TOKEN = "jeton-invalide";

const makeIdentity = (): AccessTokenIdentity => ({
  userId: USER_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
});

const verifier: AccessTokenVerifier = {
  verify: async (token) => (token === INVALID_TOKEN ? err("invalid_token") : ok(makeIdentity())),
};

const PROFILE = { id: USER_ID, name: "Viewer de test", email: "viewer@twitch.local" };

const existingProfile: ReadProfile = async (userId) =>
  userId === USER_ID ? ok(PROFILE) : err("account_not_found");

const CHANNEL = { id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69", slug: "viewer_de_test" };

const withoutChannel: FindOwnedChannel = async () => null;

const channelOfUser: FindOwnedChannel = async (ownerId) => (ownerId === USER_ID ? CHANNEL : null);

const makeFeatureFlags = (
  evaluation: () => Promise<Readonly<Record<string, unknown>>>,
): FeatureFlags & { readonly evaluatedFor: readonly string[] } => {
  const evaluatedFor: string[] = [];
  return {
    evaluatedFor,
    evaluate: async (distinctId) => {
      evaluatedFor.push(distinctId);
      return evaluation();
    },
  };
};

const flagsEvaluatedAs = (flags: Readonly<Record<string, unknown>>) =>
  makeFeatureFlags(async () => flags);

const withBootstrap = async (
  {
    featureFlags = flagsEvaluatedAs({}),
    readProfile = existingProfile,
    ownedChannel = withoutChannel,
  }: { featureFlags?: FeatureFlags; readProfile?: ReadProfile; ownedChannel?: FindOwnedChannel },
  run: (
    get: (headers?: Record<string, string>) => Promise<Response>,
    logs: readonly Readonly<Record<string, unknown>>[],
  ) => Promise<void>,
) => {
  const logs: Readonly<Record<string, unknown>>[] = [];
  const logSink = (line: string) => {
    logs.push(z.record(z.string(), z.unknown()).parse(JSON.parse(line)));
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: verifier,
      }),
      MobileModule.register({
        featureFlags,
        readProfile,
        ownedChannel,
        minSupportedVersion: "1.4.0",
        logSink,
      }),
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run((headers = {}) => fetch(`${url}/v1/mobile/bootstrap`, { headers }), logs);
  } finally {
    await app.close();
  }
};

const authenticated = { authorization: `Bearer ${VALID_TOKEN}` };

describe("GET /v1/mobile/bootstrap (ADR 0009, ADR 0012)", () => {
  it("rend la version minimale et les flags par défaut à un client anonyme, sans profil ni appel aux flags", async () => {
    const featureFlags = flagsEvaluatedAs({ session_replay: true });

    await withBootstrap({ featureFlags }, async (get) => {
      const response = await get();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        minSupportedVersion: "1.4.0",
        flags: { session_replay: false },
      });
      expect(featureFlags.evaluatedFor).toEqual([]);
    });
  });

  it("rend le profil et les flags évalués pour l'utilisateur du jeton", async () => {
    const featureFlags = flagsEvaluatedAs({ session_replay: true });

    await withBootstrap({ featureFlags }, async (get, logs) => {
      const response = await get(authenticated);

      expect(response.status).toBe(200);
      expect(responses.MobileBootstrap.parse(await response.json())).toEqual({
        minSupportedVersion: "1.4.0",
        flags: { session_replay: true },
        profile: PROFILE,
      });
      expect(featureFlags.evaluatedFor).toEqual([USER_ID]);
      expect(logs).toEqual([]);
    });
  });

  it("rend la chaîne dont l'utilisateur du jeton est propriétaire, dans son profil", async () => {
    await withBootstrap({ ownedChannel: channelOfUser }, async (get) => {
      const response = await get(authenticated);

      expect(response.status).toBe(200);
      expect(responses.MobileBootstrap.parse(await response.json()).profile).toEqual({
        ...PROFILE,
        channel: CHANNEL,
      });
    });
  });

  it("rend la bio et le début du dernier live en date ISO, dans le profil", async () => {
    const readProfile: ReadProfile = async () =>
      ok({ ...PROFILE, bio: "Speedrun", lastLiveAt: new Date("2026-11-03T20:15:00.000Z") });

    await withBootstrap({ readProfile }, async (get) => {
      const response = await get(authenticated);

      expect(response.status).toBe(200);
      expect((await response.json()).profile).toEqual({
        ...PROFILE,
        bio: "Speedrun",
        lastLiveAt: "2026-11-03T20:15:00.000Z",
      });
    });
  });

  it("rend l'URL de l'avatar dans le profil", async () => {
    const avatarUrl = "https://images.twitch.example/images/avatar/a.webp";
    const readProfile: ReadProfile = async () => ok({ ...PROFILE, avatarUrl });

    await withBootstrap({ readProfile }, async (get) => {
      expect((await (await get(authenticated)).json()).profile).toEqual({ ...PROFILE, avatarUrl });
    });
  });

  it("rend l'URL de la bannière dans le profil", async () => {
    const bannerUrl = "https://images.twitch.example/images/banner/b.webp";
    const readProfile: ReadProfile = async () => ok({ ...PROFILE, bannerUrl });

    await withBootstrap({ readProfile }, async (get) => {
      expect((await (await get(authenticated)).json()).profile).toEqual({ ...PROFILE, bannerUrl });
    });
  });

  it.each([
    ["un jeton invalide", { authorization: `Bearer ${INVALID_TOKEN}` }],
    ["un en-tête Authorization qui n'est pas Bearer", { authorization: "Basic dXNlcjpwYXNz" }],
    ["un en-tête Authorization vide", { authorization: "" }],
  ])("refuse en 401 RFC 9457 %s", async (_, headers) => {
    await withBootstrap({}, async (get) => {
      const response = await get(headers);

      expect(response.status).toBe(401);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it("refuse en 401 un jeton dont le compte n'existe plus", async () => {
    await withBootstrap({ readProfile: async () => err("account_not_found") }, async (get) => {
      const response = await get(authenticated);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    });
  });

  it("rend les flags par défaut, avec le profil, quand l'évaluation des flags échoue", async () => {
    const featureFlags = makeFeatureFlags(async () => {
      throw new Error("PostHog injoignable");
    });

    await withBootstrap({ featureFlags }, async (get) => {
      const response = await get(authenticated);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        minSupportedVersion: "1.4.0",
        flags: { session_replay: false },
        profile: PROFILE,
      });
    });
  });

  it("journalise l'échec de l'évaluation des flags, pour qu'une panne de PostHog se voie", async () => {
    const featureFlags = makeFeatureFlags(async () => {
      throw new Error("PostHog : POST /flags a répondu 401");
    });

    await withBootstrap({ featureFlags }, async (get, logs) => {
      await get(authenticated);

      expect(logs).toEqual([
        expect.objectContaining({
          level: "error",
          msg: "flags non évalués : valeurs par défaut servies",
          error: "PostHog : POST /flags a répondu 401",
        }),
      ]);
    });
  });

  it.each([
    ["absent de l'évaluation", {}],
    ["d'un type inattendu", { session_replay: "oui" }],
    ["évalué à une variante", { session_replay: "variante-b" }],
  ])("prend la valeur par défaut d'un flag %s", async (_, evaluated) => {
    await withBootstrap({ featureFlags: flagsEvaluatedAs(evaluated) }, async (get) => {
      const body = responses.MobileBootstrap.parse(await (await get(authenticated)).json());

      expect(body.flags).toEqual({ session_replay: false });
    });
  });

  it("ne renvoie pas un flag que le registre ne connaît pas", async () => {
    await withBootstrap(
      { featureFlags: flagsEvaluatedAs({ session_replay: true, flag_inconnu: true }) },
      async (get) => {
        const body = responses.MobileBootstrap.parse(await (await get(authenticated)).json());

        expect(body.flags).toEqual({ session_replay: true });
      },
    );
  });

  it("figure dans l'OpenAPI, avec MobileBootstrap", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PlatformModule.register({
          schemaVersionCheck: async () => {},
          logSink: () => {},
          accessTokenVerifier: verifier,
        }),
        MobileModule.register({
          featureFlags: flagsEvaluatedAs({}),
          readProfile: existingProfile,
          ownedChannel: withoutChannel,
          minSupportedVersion: "1.4.0",
          logSink: () => {},
        }),
      ],
    }).compile();
    const app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
    try {
      expect(buildOpenApiDocument(app)).toMatchObject({
        paths: {
          "/v1/mobile/bootstrap": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/MobileBootstrap" },
                    },
                  },
                },
              },
            },
          },
        },
      });
    } finally {
      await app.close();
    }
  });
});
