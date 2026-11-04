import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkResponseSchema, responses } from "../index.ts";

const makeProblem = (overrides: Record<string, unknown> = {}) => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  ...overrides,
});

describe("toutes les réponses exportées", () => {
  it.each(Object.entries(responses))(
    "%s respecte les conventions de l'ADR 0024",
    (name, schema) => {
      expect(checkResponseSchema(name, schema)).toEqual([]);
    },
  );

  it.each(Object.entries(responses))("%s est un schéma nommé", (name, schema) => {
    expect(z.globalRegistry.get(schema)?.id).toBe(name);
  });
});

describe("Problem", () => {
  it("décode une erreur complète produite par l'API", () => {
    const problem = makeProblem({
      detail: "Le titre est trop court.",
      instance: "/v1/channels/42",
      correlationId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      errors: [{ path: "title", message: "Too small" }],
    });

    expect(responses.Problem.parse(problem)).toEqual(problem);
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Problem.parse(makeProblem({ retryAfter: 30 }))).toMatchObject({
      retryAfter: 30,
    });
  });

  it.each([
    ["sans titre", { title: undefined }],
    ["avec un statut décimal", { status: 400.5 }],
    ["avec un statut hors HTTP", { status: 99 }],
    ["avec un statut au-delà de 599", { status: 600 }],
    ["avec une erreur de champ sans chemin", { errors: [{ message: "Too small" }] }],
    ["avec une erreur de champ sans message", { errors: [{ path: "title" }] }],
  ])("refuse une erreur %s", (_name, overrides) => {
    expect(responses.Problem.safeParse(makeProblem(overrides)).success).toBe(false);
  });
});

describe("Me", () => {
  const makeMe = (overrides: Record<string, unknown> = {}) => ({
    id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
    name: "Viewer de test",
    email: "viewer@twitch.local",
    ...overrides,
  });

  it("décode le compte de l'utilisateur authentifié", () => {
    expect(responses.Me.parse(makeMe())).toEqual(makeMe());
  });

  it("décode la bio et la date du dernier live", () => {
    const me = makeMe({ bio: "Speedrun le dimanche", lastLiveAt: "2026-11-03T20:15:00.000Z" });

    expect(responses.Me.parse(me)).toEqual(me);
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Me.parse(makeMe({ avatarUrl: "https://cdn/a.png" }))).toMatchObject({
      avatarUrl: "https://cdn/a.png",
    });
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", { id: "FWGDz5f2dSosyWpO6un25VBOMSsnkVjk" }],
    ["sans nom", { name: undefined }],
    ["sans e-mail", { email: undefined }],
    ["une bio qui n'est pas une chaîne", { bio: 42 }],
    ["une date de dernier live qui n'est pas une date ISO", { lastLiveAt: "hier" }],
  ])("refuse %s", (_name, overrides) => {
    expect(responses.Me.safeParse(makeMe(overrides)).success).toBe(false);
  });
});

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "streamer_de_test",
  title: "Speedrun du dimanche",
  ownerId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  ...overrides,
});

describe("Channel", () => {
  it("décode une chaîne, son slug, son titre et son propriétaire", () => {
    expect(responses.Channel.parse(makeChannel())).toEqual(makeChannel());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Channel.parse(makeChannel({ isLive: true }))).toMatchObject({
      isLive: true,
    });
  });

  it("décode la catégorie de la chaîne", () => {
    const category = {
      id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
      slug: "just-chatting",
      name: "Just Chatting",
    };

    expect(responses.Channel.parse(makeChannel({ category }))).toEqual(makeChannel({ category }));
  });

  it.each([
    ["avec un identifiant qui n'est pas un UUID", { id: "chaine-1" }],
    ["sans slug", { slug: undefined }],
    ["sans titre", { title: undefined }],
    ["avec un propriétaire qui n'est pas un UUID", { ownerId: "moi" }],
    [
      "avec une catégorie sans nom",
      { category: { id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f", slug: "irl" } },
    ],
  ])("refuse une chaîne %s", (_name, overrides) => {
    expect(responses.Channel.safeParse(makeChannel(overrides)).success).toBe(false);
  });
});

const makeCategory = (overrides: Record<string, unknown> = {}) => ({
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  ...overrides,
});

describe("Category", () => {
  it.each(["active", "merged", "retired"])("décode une catégorie à l'état %s", (status) => {
    expect(responses.Category.parse(makeCategory({ status }))).toEqual(makeCategory({ status }));
  });

  it("publie les trois états connus d'une catégorie", () => {
    expect(JSON.stringify(z.toJSONSchema(responses.Category))).toContain(
      '"enum":["active","merged","retired"]',
    );
  });

  it("garde un état ajouté plus tard par le serveur", () => {
    expect(responses.Category.parse(makeCategory({ status: "hidden" }))).toMatchObject({
      status: "hidden",
    });
  });

  it.each([
    ["avec un identifiant qui n'est pas un UUID", { id: "jeux" }],
    ["sans slug", { slug: undefined }],
    ["sans nom", { name: undefined }],
    ["sans état", { status: undefined }],
    ["avec une pochette qui n'est pas une URL", { imageUrl: "jc.webp" }],
  ])("refuse une catégorie %s", (_name, overrides) => {
    expect(responses.Category.safeParse(makeCategory(overrides)).success).toBe(false);
  });

  it("décode une catégorie avec sa pochette", () => {
    const category = makeCategory({
      imageUrl: "https://images.twitch.local/images/category/jc.webp",
    });

    expect(responses.Category.parse(category)).toEqual(category);
  });
});

describe("CategoryCatalog", () => {
  const makeSummary = (overrides: Record<string, unknown> = {}) => ({
    id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
    slug: "just-chatting",
    name: "Just Chatting",
    ...overrides,
  });

  it("décode les catégories proposées, chacune avec son slug et son nom", () => {
    const catalog = { categories: [makeSummary(), makeSummary({ slug: "irl", name: "IRL" })] };

    expect(responses.CategoryCatalog.parse(catalog)).toEqual(catalog);
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(
      responses.CategoryCatalog.parse({ categories: [makeSummary({ imageUrl: "https://x" })] }),
    ).toMatchObject({ categories: [{ imageUrl: "https://x" }] });
  });

  it.each([
    ["sans liste", {}],
    ["avec une catégorie sans slug", { categories: [makeSummary({ slug: undefined })] }],
    ["avec une catégorie sans nom", { categories: [makeSummary({ name: undefined })] }],
    ["avec un identifiant qui n'est pas un UUID", { categories: [makeSummary({ id: "irl" })] }],
  ])("refuse un catalogue %s", (_name, catalog) => {
    expect(responses.CategoryCatalog.safeParse(catalog).success).toBe(false);
  });
});

describe("StreamKey", () => {
  const makeStreamKey = (overrides: Record<string, unknown> = {}) => ({
    streamKey: "sk_live_0123456789abcdef",
    ingestUrl: "rtmp://127.0.0.1:1935/live",
    ...overrides,
  });

  it("décode la clé de stream et l'adresse d'ingest", () => {
    expect(responses.StreamKey.parse(makeStreamKey())).toEqual(makeStreamKey());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.StreamKey.parse(makeStreamKey({ rotatedAt: "hier" }))).toMatchObject({
      rotatedAt: "hier",
    });
  });

  it.each([
    ["sans clé", { streamKey: undefined }],
    ["avec une clé vide", { streamKey: "" }],
    ["sans adresse d'ingest", { ingestUrl: undefined }],
    ["avec une adresse d'ingest qui n'est pas une URL", { ingestUrl: "pas une url" }],
  ])("refuse une clé de stream %s", (_name, overrides) => {
    expect(responses.StreamKey.safeParse(makeStreamKey(overrides)).success).toBe(false);
  });
});

const makeTimeout = (overrides: Record<string, unknown> = {}) => ({
  channelId: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  userId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
  expiresAt: "2026-10-15T20:10:00.000Z",
  ...overrides,
});

describe("Timeout", () => {
  it("décode la chaîne, l'utilisateur sanctionné et la fin du timeout", () => {
    expect(responses.Timeout.parse(makeTimeout())).toEqual(makeTimeout());
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Timeout.parse(makeTimeout({ reason: "spam" }))).toMatchObject({
      reason: "spam",
    });
  });

  it.each([
    ["sans chaîne", { channelId: undefined }],
    ["avec une chaîne qui n'est pas un UUID", { channelId: "chaine-1" }],
    ["sans utilisateur", { userId: undefined }],
    ["avec un utilisateur qui n'est pas un UUID", { userId: "viewer" }],
    ["sans fin", { expiresAt: undefined }],
    ["avec une fin sans fuseau", { expiresAt: "2026-10-15T20:10:00" }],
  ])("refuse une réponse %s", (_name, overrides) => {
    expect(responses.Timeout.safeParse(makeTimeout(overrides)).success).toBe(false);
  });
});

describe("LivePage", () => {
  const makeLive = (overrides: Record<string, unknown> = {}) => ({
    channelId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
    slug: "streamer",
    title: "Speedrun",
    startedAt: "2026-11-02T20:00:00.000Z",
    ...overrides,
  });

  it("décode une page suivie d'une autre", () => {
    const page = { items: [makeLive()], nextCursor: "WyIyMDI2Il0" };

    expect(responses.LivePage.parse(page)).toEqual(page);
  });

  it("décode la dernière page, sans curseur suivant", () => {
    expect(responses.LivePage.parse({ items: [] })).toEqual({ items: [] });
  });

  it("décode le nombre de viewers d'un live, zéro compris", () => {
    const page = { items: [makeLive({ viewerCount: 42 }), makeLive({ viewerCount: 0 })] };

    expect(responses.LivePage.parse(page)).toEqual(page);
  });

  it("décode la catégorie d'un live, avec ou sans pochette", () => {
    const page = {
      items: [
        makeLive({ category: { slug: "irl", name: "IRL" } }),
        makeLive({
          category: { slug: "art", name: "Art", imageUrl: "https://cdn.twitch.local/art.webp" },
        }),
      ],
    };

    expect(responses.LivePage.parse(page)).toEqual(page);
  });

  it.each([
    ["sans slug", { slug: undefined }],
    ["avec une catégorie sans nom", { category: { slug: "irl" } }],
    [
      "avec une pochette qui n'est pas une URL",
      { category: { slug: "irl", name: "IRL", imageUrl: "art" } },
    ],
    ["avec un démarrage qui n'est pas une date ISO", { startedAt: "hier soir" }],
    ["avec un identifiant de chaîne qui n'est pas un UUID", { channelId: "42" }],
    ["avec un nombre de viewers négatif", { viewerCount: -1 }],
    ["avec un nombre de viewers fractionnaire", { viewerCount: 1.5 }],
  ])("refuse un live %s", (_name, overrides) => {
    expect(responses.LivePage.safeParse({ items: [makeLive(overrides)] }).success).toBe(false);
  });
});

describe("BrowseCategoryList", () => {
  const makeBrowseCategory = (overrides: Record<string, unknown> = {}) => ({
    slug: "just-chatting",
    name: "Just Chatting",
    liveCount: 3,
    ...overrides,
  });

  it("décode les catégories en live, avec leurs viewers et leur pochette", () => {
    const list = {
      items: [
        makeBrowseCategory({ viewerCount: 1200, imageUrl: "https://cdn.twitch.local/jc.webp" }),
        makeBrowseCategory({ slug: "irl", name: "IRL", liveCount: 1, viewerCount: 0 }),
      ],
    };

    expect(responses.BrowseCategoryList.parse(list)).toEqual(list);
  });

  it("décode une catégorie dont le nombre de viewers n'a pas pu être lu", () => {
    const list = { items: [makeBrowseCategory()] };

    expect(responses.BrowseCategoryList.parse(list)).toEqual(list);
  });

  it.each([
    ["sans live", { liveCount: 0 }],
    ["sans nom", { name: undefined }],
    ["avec un nombre de viewers négatif", { viewerCount: -1 }],
    ["avec une pochette qui n'est pas une URL", { imageUrl: "jc.webp" }],
  ])("refuse une catégorie %s", (_name, overrides) => {
    expect(
      responses.BrowseCategoryList.safeParse({ items: [makeBrowseCategory(overrides)] }).success,
    ).toBe(false);
  });
});

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Viewer",
  email: "viewer@twitch.local",
  ...overrides,
});

describe("MobileBootstrap", () => {
  const makeBootstrap = (overrides: Record<string, unknown> = {}) => ({
    minSupportedVersion: "1.4.0",
    flags: { session_replay: false },
    ...overrides,
  });

  it("décode le bootstrap d'un client anonyme, sans profil", () => {
    expect(responses.MobileBootstrap.parse(makeBootstrap())).toEqual(makeBootstrap());
  });

  it("décode le bootstrap d'un utilisateur connecté, avec son profil", () => {
    const bootstrap = makeBootstrap({
      profile: {
        id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
        name: "Viewer",
        email: "viewer@twitch.local",
      },
    });

    expect(responses.MobileBootstrap.parse(bootstrap)).toEqual(bootstrap);
  });

  it("décode la bio et la date du dernier live du profil", () => {
    const profile = makeProfile({ bio: "Speedrun", lastLiveAt: "2026-11-03T20:15:00.000Z" });

    expect(responses.MobileBootstrap.parse(makeBootstrap({ profile })).profile).toEqual(profile);
  });

  it("refuse un profil dont la date du dernier live n'est pas une date ISO", () => {
    const profile = makeProfile({ lastLiveAt: "hier" });

    expect(responses.MobileBootstrap.safeParse(makeBootstrap({ profile })).success).toBe(false);
  });

  it("décode la chaîne du profil", () => {
    const profile = {
      id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      name: "Viewer",
      email: "viewer@twitch.local",
      channel: { id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69", slug: "viewer" },
    };

    expect(responses.MobileBootstrap.parse(makeBootstrap({ profile })).profile).toEqual(profile);
  });

  it("décode une version minimale à plusieurs chiffres par composant", () => {
    expect(
      responses.MobileBootstrap.parse(makeBootstrap({ minSupportedVersion: "10.12.103" }))
        .minSupportedVersion,
    ).toBe("10.12.103");
  });

  it("garde un flag ajouté plus tard par le serveur", () => {
    const flags = { session_replay: true, chat_coalescence: true };

    expect(responses.MobileBootstrap.parse(makeBootstrap({ flags })).flags).toEqual(flags);
  });

  it.each([
    ["une version minimale qui n'est pas semver", { minSupportedVersion: "1.4" }],
    ["une version minimale avec un suffixe", { minSupportedVersion: "1.4.0-beta" }],
    ["une version minimale avec un préfixe", { minSupportedVersion: "v1.4.0" }],
    ["un flag session_replay qui n'est pas booléen", { flags: { session_replay: "oui" } }],
    ["sans flags", { flags: undefined }],
    ["une chaîne de profil sans slug", { profile: makeProfile({ channel: { id: CHANNEL_ID } }) }],
    [
      "une chaîne de profil dont l'identifiant n'est pas un UUID",
      { profile: makeProfile({ channel: { id: "c1", slug: "viewer" } }) },
    ],
  ])("refuse %s", (_name, overrides) => {
    expect(responses.MobileBootstrap.safeParse(makeBootstrap(overrides)).success).toBe(false);
  });
});

describe("LiveStatus", () => {
  const CHANNEL_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

  it("décode le statut d'une chaîne en live, avec son démarrage", () => {
    const status = { channelId: CHANNEL_ID, live: true, startedAt: "2026-11-03T20:00:00.000Z" };

    expect(responses.LiveStatus.parse(status)).toEqual(status);
  });

  it("décode le nombre de viewers d'une chaîne en live", () => {
    const status = {
      channelId: CHANNEL_ID,
      live: true,
      startedAt: "2026-11-03T20:00:00.000Z",
      viewerCount: 42,
    };

    expect(responses.LiveStatus.parse(status)).toEqual(status);
  });

  it("décode un live sans aucun viewer", () => {
    expect(
      responses.LiveStatus.parse({ channelId: CHANNEL_ID, live: true, viewerCount: 0 }).viewerCount,
    ).toBe(0);
  });

  it("décode le statut d'une chaîne hors live, sans démarrage", () => {
    const status = { channelId: CHANNEL_ID, live: false };

    expect(responses.LiveStatus.parse(status)).toEqual(status);
  });

  it.each([
    ["sans identifiant UUID", { channelId: "42", live: false }],
    ["sans état live", { channelId: CHANNEL_ID }],
    ["avec un nombre de viewers négatif", { channelId: CHANNEL_ID, live: true, viewerCount: -1 }],
    [
      "avec un nombre de viewers fractionnaire",
      { channelId: CHANNEL_ID, live: true, viewerCount: 1.5 },
    ],
    [
      "avec un démarrage qui n'est pas une date ISO",
      { channelId: CHANNEL_ID, live: true, startedAt: "hier" },
    ],
  ])("refuse un statut %s", (_name, status) => {
    expect(responses.LiveStatus.safeParse(status).success).toBe(false);
  });
});

describe("Playback", () => {
  const makePlayback = (overrides: Record<string, unknown> = {}) => ({
    playbackUrl:
      "https://video.example.test/hls/channels/0c9f3b2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/master.m3u8",
    ...overrides,
  });

  it("décode l'URL de lecture d'une chaîne en live", () => {
    expect(responses.Playback.parse(makePlayback())).toEqual(makePlayback());
  });

  it("décode une URL de lecture en http, celle du service vidéo local", () => {
    const playbackUrl =
      "http://127.0.0.1:3002/hls/channels/0c9f3b2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/master.m3u8";

    expect(responses.Playback.parse(makePlayback({ playbackUrl })).playbackUrl).toBe(playbackUrl);
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(responses.Playback.parse(makePlayback({ expiresAt: "demain" }))).toMatchObject({
      expiresAt: "demain",
    });
  });

  it.each([
    ["sans URL", { playbackUrl: undefined }],
    ["avec une URL qui n'en est pas une", { playbackUrl: "pas une url" }],
    ["avec une URL hors HTTP", { playbackUrl: "rtmp://video.example.test/live" }],
    ["avec un schéma qui finit par http", { playbackUrl: "xhttp://video.example.test/live" }],
    ["avec un schéma qui commence par https", { playbackUrl: "https2://video.example.test/live" }],
  ])("refuse une lecture %s", (_name, overrides) => {
    expect(responses.Playback.safeParse(makePlayback(overrides)).success).toBe(false);
  });
});

describe("ImageUpload", () => {
  const makeUpload = (overrides: Record<string, unknown> = {}) => ({
    uploadId: "0b6e2f3a-1c4d-4e5f-8a9b-0c1d2e3f4a5b",
    uploadUrl: "http://127.0.0.1:8333/twitch-local/incoming/u/avatar/0b6e?X-Amz-Signature=1",
    headers: { "Content-Type": "image/jpeg", "Content-Length": "200000" },
    expiresAt: "2026-11-04T12:05:00.000Z",
    ...overrides,
  });

  it("décode l'URL de dépôt, ses en-têtes figés et son expiration", () => {
    expect(responses.ImageUpload.parse(makeUpload())).toEqual(makeUpload());
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", { uploadId: "depot" }],
    ["une URL de dépôt qui n'est pas une URL", { uploadUrl: "pas une url" }],
    ["une URL de dépôt en ftp", { uploadUrl: "ftp://127.0.0.1/depot" }],
    ["une URL de dépôt d'un schéma qui finit par http", { uploadUrl: "xhttp://127.0.0.1/depot" }],
    [
      "une URL de dépôt d'un schéma qui commence par https",
      { uploadUrl: "httpsx://127.0.0.1/depot" },
    ],
    ["un en-tête qui n'est pas un texte", { headers: { "Content-Length": 200_000 } }],
    ["une expiration qui n'est pas une date ISO", { expiresAt: "dans 5 minutes" }],
  ])("refuse %s", (_name, overrides) => {
    expect(responses.ImageUpload.safeParse(makeUpload(overrides)).success).toBe(false);
  });
});
