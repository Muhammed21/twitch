import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createApp } from "../../create-app.ts";
import { fakeLifecycleWebhook } from "./infrastructure/fake-live-video-provider.ts";

const urlOf = (variable: string): string => {
  const url = process.env[variable];
  if (url === undefined) {
    throw new Error(`${variable} manquante : copier .env.example en .env`);
  }
  return url;
};

const openStreamConnections = async () => {
  const client = new Client({ connectionString: urlOf("DATABASE_URL_MIGRATOR") });
  await client.connect();
  try {
    const { rows } = await client.query<{ open: string }>(
      "SELECT count(*) AS open FROM pg_stat_activity WHERE usename = 'app_stream'",
    );
    return Number(rows[0]?.open);
  } finally {
    await client.end();
  }
};

describe("arrêt de l'API", () => {
  it("ferme les connexions du contexte stream", async () => {
    const { app } = await createApp({ env: process.env, logSink: () => {} });
    await app.listen(0, "127.0.0.1");
    try {
      const { body, signature } = fakeLifecycleWebhook({
        secret: urlOf("VIDEO_WEBHOOK_SECRET"),
        event: {
          id: randomUUID(),
          type: "stream.started",
          channelId: `inconnu-${randomUUID()}`,
          sessionId: `session-${randomUUID()}`,
          occurredAt: new Date(),
        },
      });
      const response = await fetch(`${await app.getUrl()}/v1/webhooks/video`, {
        method: "POST",
        headers: { "x-video-signature": signature },
        body,
      });
      expect(response.status).toBe(204);
      expect(await openStreamConnections()).toBeGreaterThan(0);
    } finally {
      await app.close();
    }

    expect(await openStreamConnections()).toBe(0);
  });
});
