import { describe, expect, it } from "vitest";

import type { ApiClient, BanUserRequest } from "@repo/api-client";

import { banUserEndpoint } from "./ban-user";

const ACTING_USER_ID = "8b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const VIEWER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const BAN = {
  channelId: CHANNEL_ID,
  userId: VIEWER_ID,
  expiresAt: "2026-11-06T13:00:00.000Z",
  reason: "Harcèlement",
};

const FORBIDDEN = { type: "about:blank", title: "Action non autorisée", status: 403 };

type BanUserAnswer = Awaited<ReturnType<ApiClient["moderation"]["banUser"]>>;

const unused = async () => {
  throw new Error("appel inattendu");
};

const recordingClient = (answer: BanUserAnswer) => {
  const sent: BanUserRequest[] = [];
  const client: ApiClient = {
    admin: {
      categories: {
        create: unused,
        merge: unused,
        retire: unused,
        changeImage: unused,
        changeTags: unused,
      },
    },
    moderation: {
      banUser: async (request) => {
        sent.push(request);
        return answer;
      },
    },
  };
  return { client, sent };
};

const makeForm = (overrides: Record<string, unknown> = {}) => ({
  channelId: CHANNEL_ID,
  targetId: VIEWER_ID,
  durationMinutes: 60,
  reason: "Harcèlement",
  ...overrides,
});

const PAYLOAD_ADMIN = { id: 1, email: "admin@twitch.test", actingUserId: ACTING_USER_ID };

const call = async ({
  answer = { ok: true, value: BAN },
  user = PAYLOAD_ADMIN,
  body = makeForm(),
  configured = true,
}: {
  answer?: BanUserAnswer;
  user?: unknown;
  body?: unknown;
  configured?: boolean;
} = {}) => {
  const { client, sent } = recordingClient(answer);
  const endpoint = banUserEndpoint(async () => (configured ? client : undefined));
  const response = await endpoint.handler({ user, json: async () => body });
  return { response, status: response.status, body: await response.json(), sent };
};

describe("action Payload : bannir un utilisateur (ADR 0007, coquille)", () => {
  it("se monte sur POST /actions/ban-user", () => {
    const endpoint = banUserEndpoint(async () => undefined);

    expect({ path: endpoint.path, method: endpoint.method }).toEqual({
      path: "/actions/ban-user",
      method: "post",
    });
  });

  it("transmet exactement les champs reçus et l'identité de l'admin à l'API", async () => {
    const { sent } = await call({ body: makeForm({ reason: "  motif tel quel " }) });

    expect(sent).toEqual([
      {
        actingUserId: ACTING_USER_ID,
        channelId: CHANNEL_ID,
        targetId: VIEWER_ID,
        durationMinutes: 60,
        reason: "  motif tel quel ",
      },
    ]);
  });

  it("transmet un bannissement définitif tel quel, sans durée", async () => {
    const { sent } = await call({ body: makeForm({ durationMinutes: null }) });

    expect(sent.map((request) => request.durationMinutes)).toEqual([null]);
  });

  it("rend le ban de l'API comme un succès", async () => {
    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, ban: BAN });
  });

  it("rend un refus de l'API comme un échec, avec son statut et son problème", async () => {
    const { status, body } = await call({
      answer: { ok: false, error: { kind: "problem", problem: FORBIDDEN } },
    });

    expect(status).toBe(403);
    expect(body).toEqual({ ok: false, problem: FORBIDDEN });
  });

  it.each([
    ["injoignable", { kind: "unreachable" }],
    ["illisible", { kind: "unreadable_response", status: 200 }],
  ] as const)("rend une API %s comme un échec 502, jamais un succès", async (_name, error) => {
    const { status, body } = await call({ answer: { ok: false, error } });

    expect(status).toBe(502);
    expect(body).toEqual({
      ok: false,
      problem: { type: "about:blank", title: "API injoignable ou réponse illisible", status: 502 },
    });
  });

  it("refuse en 401 sans admin connecté, sans appeler l'API", async () => {
    const { status, body, sent } = await call({ user: null });

    expect(status).toBe(401);
    expect(body).toMatchObject({ ok: false, problem: { status: 401 } });
    expect(sent).toEqual([]);
  });

  it("refuse en 403 un admin sans compte API rattaché, sans appeler l'API", async () => {
    const { status, body, sent } = await call({ user: { id: 1, email: "admin@twitch.test" } });

    expect(status).toBe(403);
    expect(body).toEqual({
      ok: false,
      problem: {
        type: "about:blank",
        title: "Compte API non rattaché",
        status: 403,
        detail: "Renseignez l'identifiant du compte API de cet administrateur.",
      },
    });
    expect(sent).toEqual([]);
  });

  it.each([
    ["sans chaîne", makeForm({ channelId: undefined })],
    ["avec une durée en texte", makeForm({ durationMinutes: "60" })],
    ["sans motif", makeForm({ reason: undefined })],
    ["avec un champ inconnu", makeForm({ actingUserId: "quelqu'un d'autre" })],
    ["qui n'est pas un objet", "bannir"],
  ])("refuse en 400 un corps %s, sans appeler l'API", async (_name, body) => {
    const { status, body: reply, sent } = await call({ body });

    expect(status).toBe(400);
    expect(reply).toMatchObject({ ok: false, problem: { status: 400 } });
    expect(sent).toEqual([]);
  });

  it("refuse en 400 un corps illisible, sans appeler l'API", async () => {
    const { client, sent } = recordingClient({ ok: true, value: BAN });
    const response = await banUserEndpoint(async () => client).handler({
      user: PAYLOAD_ADMIN,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    expect(response.status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("répond 503 quand l'API n'est pas configurée", async () => {
    const { status, body } = await call({ configured: false });

    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, problem: { status: 503 } });
  });

  it("ne reçoit de la requête que l'admin et le corps : aucun accès à la base Payload", async () => {
    const { client } = recordingClient({ ok: true, value: BAN });
    const request = { user: PAYLOAD_ADMIN, json: async () => makeForm() };

    expect((await banUserEndpoint(async () => client).handler(request)).status).toBe(200);
  });
});
