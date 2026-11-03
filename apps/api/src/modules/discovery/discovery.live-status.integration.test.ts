import { randomUUID } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";
import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { buildOpenApiDocument } from "../../openapi/build-document.ts";

const discovery = createContextClient({ context: "discovery", env: process.env });

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");

const seeded: string[] = [];

const seedChannelView = async ({ live }: { live: boolean }): Promise<string> => {
  const channelId = randomUUID();
  await discovery.discoveryLiveChannelView.create({
    data: {
      channelId,
      slug: `statut_${randomUUID().replaceAll("-", "").slice(0, 12)}`,
      title: "Statut",
      ...(live ? { liveSessionId: randomUUID(), liveStartedAt: STARTED_AT } : {}),
    },
  });
  seeded.push(channelId);
  return channelId;
};

const state: { app?: INestApplication; url?: string } = {};

const appOf = (): INestApplication => {
  if (state.app === undefined) {
    throw new Error("API non démarrée");
  }
  return state.app;
};

beforeAll(async () => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  state.app = app;
  state.url = await app.getUrl();
});

afterAll(async () => {
  await discovery.discoveryLiveChannelView.deleteMany({ where: { channelId: { in: seeded } } });
  await state.app?.close();
  await discovery.$disconnect();
});

const statusEvents = async (channelId: string) => {
  const aborting = new AbortController();
  const response = await fetch(`${state.url}/v1/channels/${channelId}/live-status`, {
    signal: aborting.signal,
  });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("flux SSE sans corps");
  }
  const decoder = new TextDecoder();
  const buffered = { text: "" };
  const next = async (): Promise<unknown> => {
    const match = /event: status\ndata: (.*)\n\n/.exec(buffered.text);
    if (match?.[1] !== undefined) {
      buffered.text = buffered.text.slice(match.index + match[0].length);
      return responses.LiveStatus.parse(JSON.parse(match[1]));
    }
    const { done, value } = await reader.read();
    if (done) {
      throw new Error("flux SSE fermé");
    }
    buffered.text += decoder.decode(value, { stream: true });
    return next();
  };
  return { response, next, close: () => aborting.abort() };
};

describe("GET /v1/channels/{channelId}/live-status sur l'API assemblée", () => {
  it("envoie l'état de la projection, puis la fin du live en moins de deux secondes", async () => {
    const channelId = await seedChannelView({ live: true });
    const events = await statusEvents(channelId);
    try {
      expect(events.response.headers.get("content-type")).toContain("text/event-stream");
      expect(await events.next()).toEqual({
        channelId,
        live: true,
        startedAt: STARTED_AT.toISOString(),
      });

      await discovery.discoveryLiveChannelView.update({
        where: { channelId },
        data: { liveSessionId: null, liveStartedAt: null, lastEndedAt: new Date() },
      });
      const endedAt = performance.now();

      expect(await events.next()).toEqual({ channelId, live: false });
      expect(performance.now() - endedAt).toBeLessThan(2000);
    } finally {
      events.close();
    }
  });

  it.each([
    ["un démarrage sans session ouverte", { liveStartedAt: STARTED_AT }],
    ["une session ouverte sans démarrage", { liveSessionId: randomUUID() }],
  ])("annonce hors live une chaîne qui garde %s", async (_, partialLive) => {
    const channelId = await seedChannelView({ live: false });
    await discovery.discoveryLiveChannelView.update({ where: { channelId }, data: partialLive });
    const events = await statusEvents(channelId);
    try {
      expect(await events.next()).toEqual({ channelId, live: false });
    } finally {
      events.close();
    }
  });

  it("envoie un commentaire SSE toutes les 15 secondes pour garder la connexion ouverte", async () => {
    const channelId = await seedChannelView({ live: false });
    const aborting = new AbortController();
    const response = await fetch(`${state.url}/v1/channels/${channelId}/live-status`, {
      signal: aborting.signal,
    });
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("flux SSE sans corps");
    }
    const decoder = new TextDecoder();
    const openedAt = performance.now();
    const untilPing = async (received: string): Promise<number> => {
      if (received.includes(": ping\n\n")) {
        return performance.now() - openedAt;
      }
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("flux SSE fermé");
      }
      return untilPing(received + decoder.decode(value, { stream: true }));
    };
    try {
      const elapsed = await untilPing("");

      expect(elapsed).toBeGreaterThan(14_500);
      expect(elapsed).toBeLessThan(16_000);
    } finally {
      aborting.abort();
    }
  }, 20_000);

  it("répond sans jeton d'accès, et refuse en 404 une chaîne que discovery ne connaît pas", async () => {
    const response = await fetch(`${state.url}/v1/channels/${randomUUID()}/live-status`);

    expect(response.status).toBe(404);
    expect(responses.Problem.parse(await response.json()).title).toBe("Chaîne introuvable");
  });

  it("figure dans l'OpenAPI, en text/event-stream avec LiveStatus", () => {
    expect(buildOpenApiDocument(appOf())).toMatchObject({
      paths: {
        "/v1/channels/{channelId}/live-status": {
          get: {
            responses: {
              200: {
                content: {
                  "text/event-stream": { schema: { $ref: "#/components/schemas/LiveStatus" } },
                },
              },
            },
          },
        },
      },
      components: { schemas: { LiveStatus: expect.any(Object) } },
    });
  });
});
