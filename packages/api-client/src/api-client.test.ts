import { exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import {
  createActingUserVerifier,
  importActingUserPrivateKey,
  importActingUserPublicKey,
} from "@repo/auth-verifier";

import { createApiClient } from "./api-client.ts";

const BASE_URL = "http://api.test";
const SERVICE_SECRET = "secret-du-compte-de-service-payload-admin";
const ADMIN_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const NOW = new Date("2026-11-06T12:00:00.000Z");
const UPLOAD_ID = "9e8f7a6b-5c4d-4e3f-8a2b-1c0d9e8f7a6b";

const CATEGORY = {
  id: "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f",
  slug: "just-chatting",
  name: "Just Chatting",
  status: "active",
  tags: ["IRL"],
};

const keyPair = async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });
  return {
    publicJwk: JSON.stringify(await exportJWK(publicKey)),
    privateJwk: JSON.stringify(await exportJWK(privateKey)),
  };
};

const KEYS = await keyPair();

type SentRequest = {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
};

const jsonResponse = (status: number, body: unknown, contentType = "application/json") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": contentType } });

const makeClient = async ({
  respond = () => jsonResponse(200, CATEGORY),
  clock = { now: () => NOW },
}: {
  respond?: () => Response | Promise<Response>;
  clock?: { now?: () => Date };
} = {}) => {
  const sent: SentRequest[] = [];
  const client = createApiClient({
    baseUrl: BASE_URL,
    serviceSecret: SERVICE_SECRET,
    actingUserPrivateKey: await importActingUserPrivateKey(KEYS.privateJwk),
    ...clock,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const text = await request.text();
      sent.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: text === "" ? undefined : JSON.parse(text),
      });
      return respond();
    },
  });
  return { client, sent };
};

const humanOf = async (headers: Headers) =>
  createActingUserVerifier({
    publicKey: await importActingUserPublicKey(KEYS.publicJwk),
  }).verify(String(headers.get("x-acting-user")), NOW);

describe("client de l'API pour Payload (ADR 0007)", () => {
  it("porte le secret du compte de service et l'humain signé dans X-Acting-User", async () => {
    const { client, sent } = await makeClient();

    await client.admin.categories.create({
      actingUserId: ADMIN_ID,
      slug: "just-chatting",
      name: "Just Chatting",
    });

    const [request] = sent;
    expect(request?.headers.get("authorization")).toBe(`Service ${SERVICE_SECRET}`);
    expect(await humanOf(request?.headers ?? new Headers())).toEqual({
      ok: true,
      value: { userId: ADMIN_ID },
    });
  });

  it.each([
    [
      "crée une catégorie",
      (client: Awaited<ReturnType<typeof makeClient>>["client"]) =>
        client.admin.categories.create({
          actingUserId: ADMIN_ID,
          slug: "just-chatting",
          name: "Just Chatting",
        }),
      {
        method: "POST",
        url: `${BASE_URL}/v1/admin/categories`,
        body: { slug: "just-chatting", name: "Just Chatting" },
      },
    ],
    [
      "fusionne une catégorie dans une autre",
      (client: Awaited<ReturnType<typeof makeClient>>["client"]) =>
        client.admin.categories.merge({
          actingUserId: ADMIN_ID,
          slug: "irl",
          targetSlug: "just-chatting",
        }),
      {
        method: "POST",
        url: `${BASE_URL}/v1/admin/categories/irl/merge`,
        body: { targetSlug: "just-chatting" },
      },
    ],
    [
      "retire une catégorie",
      (client: Awaited<ReturnType<typeof makeClient>>["client"]) =>
        client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" }),
      { method: "POST", url: `${BASE_URL}/v1/admin/categories/irl/retire`, body: undefined },
    ],
    [
      "change l'image d'une catégorie",
      (client: Awaited<ReturnType<typeof makeClient>>["client"]) =>
        client.admin.categories.changeImage({
          actingUserId: ADMIN_ID,
          slug: "irl",
          uploadId: UPLOAD_ID,
        }),
      {
        method: "PUT",
        url: `${BASE_URL}/v1/admin/categories/irl/image`,
        body: { uploadId: UPLOAD_ID },
      },
    ],
    [
      "change les tags d'une catégorie",
      (client: Awaited<ReturnType<typeof makeClient>>["client"]) =>
        client.admin.categories.changeTags({
          actingUserId: ADMIN_ID,
          slug: "irl",
          tags: ["IRL"],
        }),
      {
        method: "PUT",
        url: `${BASE_URL}/v1/admin/categories/irl/tags`,
        body: { tags: ["IRL"] },
      },
    ],
  ])("%s par la route d'administration", async (_case, call, expected) => {
    const { client, sent } = await makeClient();

    const outcome = await call(client);

    expect(outcome).toEqual({ ok: true, value: CATEGORY });
    expect(sent.map(({ method, url, body }) => ({ method, url, body }))).toEqual([expected]);
    expect(sent[0]?.headers.get("content-type")).toBe(
      expected.body === undefined ? null : "application/json",
    );
  });

  it("encode le slug dans le chemin", async () => {
    const { client, sent } = await makeClient();

    await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "a/b?c" });

    expect(sent[0]?.url).toBe(`${BASE_URL}/v1/admin/categories/a%2Fb%3Fc/retire`);
  });

  it("rend un refus de l'API comme un échec, avec son problème", async () => {
    const problem = { type: "about:blank", title: "Action non autorisée", status: 403 };
    const { client } = await makeClient({
      respond: () => jsonResponse(403, problem, "application/problem+json"),
    });

    expect(await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" })).toEqual({
      ok: false,
      error: { kind: "problem", problem },
    });
  });

  it("rend une réponse illisible comme un échec, jamais comme un succès", async () => {
    const { client } = await makeClient({ respond: () => jsonResponse(200, { id: "x" }) });

    expect(await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" })).toEqual({
      ok: false,
      error: { kind: "unreadable_response", status: 200 },
    });
  });

  it("rend un échec non décrit par un problème comme une réponse illisible", async () => {
    const { client } = await makeClient({
      respond: () => new Response("Bad Gateway", { status: 502 }),
    });

    expect(await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" })).toEqual({
      ok: false,
      error: { kind: "unreadable_response", status: 502 },
    });
  });

  it("rend une API injoignable comme un échec", async () => {
    const { client } = await makeClient({
      respond: () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" })).toEqual({
      ok: false,
      error: { kind: "unreachable" },
    });
  });

  it("signe un nouvel en-tête à chaque appel, à l'heure de l'appel", async () => {
    const { client, sent } = await makeClient();

    await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" });

    const [, payload] = String(sent[0]?.headers.get("x-acting-user")).split(".");
    expect(JSON.parse(Buffer.from(String(payload), "base64url").toString())).toMatchObject({
      iat: NOW.getTime() / 1000,
    });
  });

  it("signe à l'heure courante quand aucune horloge n'est donnée", async () => {
    const { client, sent } = await makeClient({ clock: {} });
    const before = Math.floor(Date.now() / 1000);

    await client.admin.categories.retire({ actingUserId: ADMIN_ID, slug: "irl" });

    const [, payload] = String(sent[0]?.headers.get("x-acting-user")).split(".");
    const { iat } = JSON.parse(Buffer.from(String(payload), "base64url").toString());
    expect(iat).toBeGreaterThanOrEqual(before);
    expect(iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });
});

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const BAN = {
  channelId: CHANNEL_ID,
  userId: VIEWER_ID,
  expiresAt: "2026-11-06T13:00:00.000Z",
  reason: "Harcèlement",
};

describe("bannissement par le client de l'API (ADR 0007)", () => {
  it("bannit pour une durée par la route d'administration, au nom de l'humain signé", async () => {
    const { client, sent } = await makeClient({ respond: () => jsonResponse(201, BAN) });

    const outcome = await client.moderation.banUser({
      actingUserId: ADMIN_ID,
      channelId: CHANNEL_ID,
      targetId: VIEWER_ID,
      durationMinutes: 60,
      reason: "Harcèlement",
    });

    expect(outcome).toEqual({ ok: true, value: BAN });
    expect(sent.map(({ method, url, body }) => ({ method, url, body }))).toEqual([
      {
        method: "POST",
        url: `${BASE_URL}/v1/admin/channels/${CHANNEL_ID}/bans`,
        body: { userId: VIEWER_ID, durationMinutes: 60, reason: "Harcèlement" },
      },
    ]);
    expect(sent[0]?.headers.get("authorization")).toBe(`Service ${SERVICE_SECRET}`);
    expect(await humanOf(sent[0]?.headers ?? new Headers())).toEqual({
      ok: true,
      value: { userId: ADMIN_ID },
    });
  });

  it("bannit définitivement sans durée dans le corps, et rend le ban sans fin", async () => {
    const { expiresAt: _end, ...definitive } = BAN;
    const { client, sent } = await makeClient({ respond: () => jsonResponse(201, definitive) });

    const outcome = await client.moderation.banUser({
      actingUserId: ADMIN_ID,
      channelId: CHANNEL_ID,
      targetId: VIEWER_ID,
      durationMinutes: null,
      reason: "Harcèlement",
    });

    expect(outcome).toEqual({ ok: true, value: definitive });
    expect(sent[0]?.body).toEqual({ userId: VIEWER_ID, reason: "Harcèlement" });
  });

  it("encode la chaîne dans le chemin", async () => {
    const { client, sent } = await makeClient({ respond: () => jsonResponse(201, BAN) });

    await client.moderation.banUser({
      actingUserId: ADMIN_ID,
      channelId: "a/b",
      targetId: VIEWER_ID,
      durationMinutes: 60,
      reason: "Harcèlement",
    });

    expect(sent[0]?.url).toBe(`${BASE_URL}/v1/admin/channels/a%2Fb/bans`);
  });

  it("rend un refus de l'API comme un échec, avec son problème", async () => {
    const problem = { type: "about:blank", title: "Action non autorisée", status: 403 };
    const { client } = await makeClient({
      respond: () => jsonResponse(403, problem, "application/problem+json"),
    });

    expect(
      await client.moderation.banUser({
        actingUserId: ADMIN_ID,
        channelId: CHANNEL_ID,
        targetId: VIEWER_ID,
        durationMinutes: 60,
        reason: "Harcèlement",
      }),
    ).toEqual({ ok: false, error: { kind: "problem", problem } });
  });
});
