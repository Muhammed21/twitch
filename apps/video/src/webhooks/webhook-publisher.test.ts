import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, onTestFinished } from "vitest";

import type { OutboxEvent } from "@repo/db";
import { StreamEnded } from "@repo/video-contract";

import { startWebhookReceiver, verifySignature } from "./testing/webhook-receiver.ts";
import { signWebhook, webhookPublisher } from "./webhook-publisher.ts";

const SECRET = "secret-de-webhook-de-test-32-car";
const SIGNED_AT = new Date("2026-11-03T20:00:00.999Z");

const makeOutboxEvent = (overrides: Partial<OutboxEvent> = {}): OutboxEvent => {
  const id = randomUUID();
  return {
    id,
    name: "stream.ended",
    version: 1,
    payload: {
      id,
      type: "stream.ended",
      channelId: randomUUID(),
      sessionId: randomUUID(),
      occurredAt: "2026-11-03T19:59:00.000Z",
    },
    occurredAt: new Date("2026-11-03T19:59:00.000Z"),
    ...overrides,
  };
};

const receiver = async (respond: () => number = () => 204) => {
  const started = await startWebhookReceiver({ respond });
  onTestFinished(() => started.close());
  return started;
};

const publisherTo = (url: string, timeoutMs?: number) =>
  webhookPublisher({ url, secret: SECRET, now: () => SIGNED_AT, timeoutMs });

describe("signature d'un webhook (ADR 0031, mécanisme de l'ADR 0007)", () => {
  it("signe en HMAC-SHA256 l'horodatage en secondes puis le corps, au format vérifié par l'API", () => {
    expect(signWebhook({ secret: SECRET, body: Buffer.from('{"id":"evt"}'), at: SIGNED_AT })).toBe(
      "t=1793736000,v1=0047247e10e0c3c8c6d5fed6e1bd1ba3d99107eb785b3cb7ababd9afea07005a",
    );
  });
});

describe("publication d'un événement en webhook signé", () => {
  it("envoie le payload de l'événement en JSON, avec une signature vérifiable par le récepteur", async () => {
    const { url, deliveries } = await receiver();
    const event = makeOutboxEvent();

    await publisherTo(url)(event);

    const [delivery] = deliveries;
    expect(delivery?.contentType).toBe("application/json");
    expect(StreamEnded.parse(JSON.parse(String(delivery?.body)))).toEqual(event.payload);
    expect(
      verifySignature({
        secret: SECRET,
        body: delivery?.body ?? Buffer.alloc(0),
        signature: String(delivery?.signature),
        now: SIGNED_AT,
      }),
    ).toBe(true);
  });

  it("voit sa signature refusée si un seul octet du corps change", async () => {
    const { url, deliveries } = await receiver();
    await publisherTo(url)(makeOutboxEvent());
    const [delivery] = deliveries;
    const body = Buffer.from(delivery?.body ?? Buffer.alloc(0));
    body.writeUInt8(body.readUInt8(10) ^ 1, 10);

    expect(
      verifySignature({
        secret: SECRET,
        body,
        signature: String(delivery?.signature),
        now: SIGNED_AT,
      }),
    ).toBe(false);
  });

  it("voit sa signature refusée par un récepteur qui la reçoit plus de 5 minutes après", async () => {
    const { url, deliveries } = await receiver();
    await publisherTo(url)(makeOutboxEvent());
    const [delivery] = deliveries;
    const verifyAt = (seconds: number) =>
      verifySignature({
        secret: SECRET,
        body: delivery?.body ?? Buffer.alloc(0),
        signature: String(delivery?.signature),
        now: new Date(Math.floor(SIGNED_AT.getTime() / 1000) * 1000 + seconds * 1000),
      });

    expect(verifyAt(300)).toBe(true);
    expect(verifyAt(301)).toBe(false);
  });

  it.each([200, 204])("considère l'événement publié sur un %i", async (status) => {
    const { url } = await receiver(() => status);

    await expect(publisherTo(url)(makeOutboxEvent())).resolves.toBeUndefined();
  });

  it.each([409, 500])(
    "échoue en nommant le statut %i, pour que le relais réessaie",
    async (status) => {
      const { url } = await receiver(() => status);

      await expect(publisherTo(url)(makeOutboxEvent())).rejects.toThrow(
        `webhook refusé par l'API : ${status}`,
      );
    },
  );

  it("abandonne un envoi resté sans réponse au-delà du délai", async () => {
    const server = createServer(() => {}).listen(0, "127.0.0.1");
    await once(server, "listening");
    onTestFinished(() => {
      server.closeAllConnections();
      server.close();
    });
    const { port } = server.address() as AddressInfo;

    await expect(
      publisherTo(`http://127.0.0.1:${port}/v1/webhooks/video`, 50)(makeOutboxEvent()),
    ).rejects.toThrow(/timeout|abort/i);
  });
});
