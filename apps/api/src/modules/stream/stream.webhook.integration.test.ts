import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { createContextClient } from "@repo/db";

import { createApp } from "../../create-app.ts";
import { signWebhook } from "../../platform/webhook-signature.ts";
import { fakeLifecycleWebhook } from "./infrastructure/fake-live-video-provider.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const SECRET = urlOf("VIDEO_WEBHOOK_SECRET");

const prisma = createContextClient({ context: "stream", env: process.env });

const seedChannel = async () => {
  const channel = { channelId: randomUUID(), providerChannelId: `provider-${randomUUID()}` };
  await prisma.streamChannel.create({ data: channel });
  return channel;
};

const withApi = async (run: (url: string) => Promise<void>) => {
  const { app } = await createApp({ env: process.env, logSink: () => {} });
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/webhooks/video`);
  } finally {
    await app.close();
  }
};

const deliver = (url: string, { body, signature }: { body: string; signature: string }) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-video-signature": signature },
    body,
  });

const lifecycle = (
  providerChannelId: string,
  overrides: Partial<Parameters<typeof fakeLifecycleWebhook>[0]["event"]> = {},
) => ({
  id: randomUUID(),
  type: "stream.started" as const,
  channelId: providerChannelId,
  sessionId: `session-${randomUUID()}`,
  occurredAt: new Date(),
  ...overrides,
});

const sessionsOf = (channelId: string) => prisma.streamSession.findMany({ where: { channelId } });

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /v1/webhooks/video, contre le provider factice (ADR 0001, ADR 0031)", () => {
  it("ouvre la session d'un démarrage signé, une seule fois même si le webhook est rejoué", async () => {
    const channel = await seedChannel();
    const webhook = fakeLifecycleWebhook({
      secret: SECRET,
      event: lifecycle(channel.providerChannelId),
    });

    await withApi(async (url) => {
      expect((await deliver(url, webhook)).status).toBe(204);
      expect((await deliver(url, webhook)).status).toBe(204);
    });

    expect(await sessionsOf(channel.channelId)).toHaveLength(1);
  });

  it("refuse en 401 une signature fausse, sans lire un corps qui n'est même pas du JSON", async () => {
    const channel = await seedChannel();
    const eventId = randomUUID();
    const body = `{"id":"${eventId}","type":"stream.started",pas du json`;

    await withApi(async (url) => {
      const response = await deliver(url, {
        body,
        signature: signWebhook({ secret: "x".repeat(32), body: Buffer.from(body), at: new Date() }),
      });

      expect(response.status).toBe(401);
    });

    expect(await sessionsOf(channel.channelId)).toEqual([]);
    expect(await prisma.streamProcessedEvent.findMany({ where: { eventId } })).toEqual([]);
  });

  it("refuse en 401 un webhook signé il y a plus de 5 minutes", async () => {
    const channel = await seedChannel();
    const webhook = fakeLifecycleWebhook({
      secret: SECRET,
      event: lifecycle(channel.providerChannelId),
      at: new Date(Date.now() - 301_000),
    });

    await withApi(async (url) => {
      expect((await deliver(url, webhook)).status).toBe(401);
    });

    expect(await sessionsOf(channel.channelId)).toEqual([]);
  });

  it("répond 409 à une fin reçue avant son démarrage, puis 204 quand elle revient après", async () => {
    const channel = await seedChannel();
    const start = lifecycle(channel.providerChannelId);
    const end = fakeLifecycleWebhook({
      secret: SECRET,
      event: { ...start, id: randomUUID(), type: "stream.ended", occurredAt: new Date() },
    });

    await withApi(async (url) => {
      expect((await deliver(url, end)).status).toBe(409);
      await deliver(url, fakeLifecycleWebhook({ secret: SECRET, event: start }));
      expect((await deliver(url, end)).status).toBe(204);
    });

    expect(await sessionsOf(channel.channelId)).toEqual([
      expect.objectContaining({ endedAt: expect.any(Date) }),
    ]);
  });

  it("refuse en 400 un webhook bien signé dont le contenu est invalide", async () => {
    const body = JSON.stringify({ id: randomUUID(), type: "stream.paused" });

    await withApi(async (url) => {
      const response = await deliver(url, {
        body,
        signature: signWebhook({ secret: SECRET, body: Buffer.from(body), at: new Date() }),
      });

      expect(response.status).toBe(400);
    });
  });

  it("refuse en 400 un corps bien signé qui n'est pas du JSON", async () => {
    const body = "{pas du json";

    await withApi(async (url) => {
      const response = await deliver(url, {
        body,
        signature: signWebhook({ secret: SECRET, body: Buffer.from(body), at: new Date() }),
      });

      expect(response.status).toBe(400);
    });
  });

  it("acquitte en 204 l'event d'un canal provider inconnu, sans ouvrir de session", async () => {
    const event = lifecycle(`inconnu-${randomUUID()}`);

    await withApi(async (url) => {
      const response = await deliver(url, fakeLifecycleWebhook({ secret: SECRET, event }));

      expect(response.status).toBe(204);
    });

    expect(
      await prisma.streamSession.findMany({ where: { providerSessionId: event.sessionId } }),
    ).toEqual([]);
  });
});
