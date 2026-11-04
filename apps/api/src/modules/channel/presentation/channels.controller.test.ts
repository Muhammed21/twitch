import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import type { AccessTokenIdentity } from "@repo/auth-verifier";
import { err, ok, type Result } from "@repo/result";

import { buildOpenApiDocument } from "../../../openapi/build-document.ts";
import type { AccessTokenVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import type { ChannelUpdateError, ChannelView } from "../application/channel-queries.ts";
import {
  CHANNEL_IMAGE_URL,
  ChannelsController,
  GET_CHANNEL,
  type GetChannel,
  UPDATE_CHANNEL,
  type UpdateChannel,
} from "./channels.controller.ts";

const ACTOR_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const CHANNEL: ChannelView = {
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "streamer_de_test",
  title: "Speedrun du dimanche",
  ownerId: ACTOR_ID,
  category: null,
  bannerKey: null,
};

const JUST_CHATTING = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
};

const { category: _none, bannerKey: _noBanner, ...CHANNEL_RESPONSE } = CHANNEL;

const BANNER_KEY = "images/banner/b.webp";
const imageUrlOf = (key: string) => `https://images.invalid/${key}`;

const IDENTITY: AccessTokenIdentity = {
  userId: ACTOR_ID,
  sid: "sid-1",
  scopes: [],
  authTime: null,
  amr: [],
  revocation: "checked",
};

const acceptingVerifier: AccessTokenVerifier = { verify: async () => ok(IDENTITY) };

type Calls = { titleUpdates: Parameters<UpdateChannel>[0][] };

const withChannels = async (
  {
    getChannel = async () => ok(CHANNEL),
    updateTitle = async () => ok(CHANNEL),
  }: {
    getChannel?: GetChannel;
    updateTitle?: (
      request: Parameters<UpdateChannel>[0],
    ) => Promise<Result<ChannelView, ChannelUpdateError>>;
  },
  run: (base: string, calls: Calls, app: INestApplication) => Promise<void>,
) => {
  const calls: Calls = { titleUpdates: [] };
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: acceptingVerifier,
      }),
    ],
    controllers: [ChannelsController],
    providers: [
      { provide: GET_CHANNEL, useValue: getChannel },
      { provide: CHANNEL_IMAGE_URL, useValue: imageUrlOf },
      {
        provide: UPDATE_CHANNEL,
        useValue: (request: Parameters<UpdateChannel>[0]) => {
          calls.titleUpdates.push(request);
          return updateTitle(request);
        },
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/channels`, calls, app);
  } finally {
    await app.close();
  }
};

const patch = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer jeton", ...headers },
    body: JSON.stringify(body),
  });

describe("GET /v1/channels/{slug}", () => {
  it("rend la chaîne du slug, sans jeton", async () => {
    await withChannels(
      {
        getChannel: async (slug) =>
          slug === CHANNEL.slug ? ok(CHANNEL) : err("channel_not_found"),
      },
      async (base) => {
        const response = await fetch(`${base}/${CHANNEL.slug}`);

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(CHANNEL_RESPONSE);
      },
    );
  });

  it("rend la catégorie de la chaîne quand elle en a une", async () => {
    await withChannels(
      { getChannel: async () => ok({ ...CHANNEL, category: JUST_CHATTING }) },
      async (base) => {
        const response = await fetch(`${base}/${CHANNEL.slug}`);

        expect(await response.json()).toEqual({ ...CHANNEL_RESPONSE, category: JUST_CHATTING });
      },
    );
  });

  it("rend l'URL de la bannière quand la chaîne en a une", async () => {
    await withChannels(
      { getChannel: async () => ok({ ...CHANNEL, bannerKey: BANNER_KEY }) },
      async (base) => {
        const response = await fetch(`${base}/${CHANNEL.slug}`);

        expect(await response.json()).toEqual({
          ...CHANNEL_RESPONSE,
          bannerUrl: imageUrlOf(BANNER_KEY),
        });
      },
    );
  });

  it("répond 404 pour un slug inconnu", async () => {
    await withChannels({ getChannel: async () => err("channel_not_found") }, async (base) => {
      const response = await fetch(`${base}/inconnue`);

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ status: 404, title: "Chaîne introuvable" });
    });
  });
});

describe("PATCH /v1/channels/{id}", () => {
  it("change le titre pour l'identité du jeton, et rend la chaîne", async () => {
    await withChannels({}, async (base, calls) => {
      const response = await patch(`${base}/${CHANNEL.id}`, { title: "Speedrun du dimanche" });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(CHANNEL_RESPONSE);
      expect(calls.titleUpdates).toEqual([
        { actorId: ACTOR_ID, channelId: CHANNEL.id, title: "Speedrun du dimanche" },
      ]);
    });
  });

  it("change le titre de la chaîne en minuscules quand son UUID arrive en majuscules", async () => {
    await withChannels({}, async (base, calls) => {
      const response = await patch(`${base}/${CHANNEL.id.toUpperCase()}`, { title: "Titre" });

      expect(response.status).toBe(200);
      expect(calls.titleUpdates).toEqual([
        { actorId: ACTOR_ID, channelId: CHANNEL.id, title: "Titre" },
      ]);
    });
  });

  it("répond 401 sans jeton", async () => {
    await withChannels({}, async (base, calls) => {
      const response = await fetch(`${base}/${CHANNEL.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Titre" }),
      });

      expect(response.status).toBe(401);
      expect(calls.titleUpdates).toEqual([]);
    });
  });

  it("répond 403 à un compte qui n'a pas le droit de modifier la chaîne", async () => {
    await withChannels({ updateTitle: async () => err("forbidden") }, async (base) => {
      const response = await patch(`${base}/${CHANNEL.id}`, { title: "Pris en otage" });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ status: 403, title: "Action non autorisée" });
    });
  });

  it("répond 404 pour une chaîne inconnue", async () => {
    await withChannels({ updateTitle: async () => err("channel_not_found") }, async (base) => {
      const response = await patch(`${base}/${CHANNEL.id}`, { title: "Titre" });

      expect(response.status).toBe(404);
    });
  });

  it("répond 404 pour un identifiant qui n'est pas un UUID, sans appeler le use-case", async () => {
    await withChannels({}, async (base, calls) => {
      const response = await patch(`${base}/streamer_de_test`, { title: "Titre" });

      expect(response.status).toBe(404);
      expect(calls.titleUpdates).toEqual([]);
    });
  });

  it("répond 422 pour un titre trop long", async () => {
    await withChannels({ updateTitle: async () => err("title_too_long") }, async (base) => {
      const response = await patch(`${base}/${CHANNEL.id}`, { title: "a".repeat(141) });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        status: 422,
        title: "Titre invalide",
        detail: "Le titre compte au plus 140 caractères.",
      });
    });
  });

  it("pose la catégorie, en minuscules quand son UUID arrive en majuscules", async () => {
    await withChannels(
      { updateTitle: async () => ok({ ...CHANNEL, category: JUST_CHATTING }) },
      async (base, calls) => {
        const response = await patch(`${base}/${CHANNEL.id}`, {
          category: { id: JUST_CHATTING.id.toUpperCase() },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ...CHANNEL_RESPONSE, category: JUST_CHATTING });
        expect(calls.titleUpdates).toEqual([
          { actorId: ACTOR_ID, channelId: CHANNEL.id, categoryId: JUST_CHATTING.id },
        ]);
      },
    );
  });

  it("retire la catégorie avec un choix de catégorie vide", async () => {
    await withChannels({}, async (base, calls) => {
      const response = await patch(`${base}/${CHANNEL.id}`, { category: {} });

      expect(response.status).toBe(200);
      expect(calls.titleUpdates).toEqual([
        { actorId: ACTOR_ID, channelId: CHANNEL.id, categoryId: null },
      ]);
    });
  });

  it("répond 422 pour une catégorie fusionnée, retirée ou inconnue", async () => {
    await withChannels({ updateTitle: async () => err("category_unavailable") }, async (base) => {
      const response = await patch(`${base}/${CHANNEL.id}`, {
        category: { id: JUST_CHATTING.id },
      });

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        status: 422,
        title: "Catégorie invalide",
        detail: "La catégorie n'existe pas, ou elle a été fusionnée ou retirée.",
      });
    });
  });

  it("refuse un corps vide en disant ce qu'il doit changer", async () => {
    await withChannels({}, async (base) => {
      const response = await patch(`${base}/${CHANNEL.id}`, {});

      expect(response.status).toBe(400);
      expect(JSON.stringify(await response.json())).toContain(
        "Le corps change le titre, la catégorie, ou les deux.",
      );
    });
  });

  it("publie le choix de catégorie sous le schéma nommé CategoryChoice", async () => {
    await withChannels({}, async (_base, _calls, app) => {
      expect(JSON.stringify(buildOpenApiDocument(app))).toContain(
        '"category":{"$ref":"#/components/schemas/CategoryChoice"}',
      );
    });
  });

  it.each([
    ["vide", {}],
    ["avec une catégorie qui n'est pas un UUID", { category: { id: "just-chatting" } }],
    ["avec une catégorie nulle", { category: null }],
    ["avec un champ inconnu dans la catégorie", { category: { slug: "irl" } }],
    ["avec un titre qui n'est pas un texte", { title: 42 }],
    ["avec un champ inconnu", { title: "Titre", slug: "autre" }],
  ])("répond 400 à un corps %s", async (_name, body) => {
    await withChannels({}, async (base, calls) => {
      const response = await patch(`${base}/${CHANNEL.id}`, body);

      expect(response.status).toBe(400);
      expect(calls.titleUpdates).toEqual([]);
    });
  });
});
