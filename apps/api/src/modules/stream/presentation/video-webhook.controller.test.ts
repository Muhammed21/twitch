import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { useRawWebhookBodies } from "../../../platform/raw-webhook-body.ts";
import {
  RECEIVE_PROVIDER_WEBHOOK,
  type ReceiveProviderWebhook,
  VideoWebhookController,
} from "./video-webhook.controller.ts";

type Received = Parameters<ReceiveProviderWebhook>[0];

const withWebhook = async (
  answer: Awaited<ReturnType<ReceiveProviderWebhook>>,
  run: (url: string, received: Received[]) => Promise<void>,
  { rawBodies = true }: { rawBodies?: boolean } = {},
) => {
  const received: Received[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [VideoWebhookController],
    providers: [
      {
        provide: RECEIVE_PROVIDER_WEBHOOK,
        useValue: async (request: Received) => {
          received.push(request);
          return answer;
        },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  if (rawBodies) {
    useRawWebhookBodies(app);
  }
  app.useBodyParser("json");
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/webhooks/video`, received);
  } finally {
    await app.close();
  }
};

const post = (url: string, body: string, signature?: string) =>
  fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature === undefined ? {} : { "x-video-signature": signature }),
    },
    body,
  });

describe("POST /v1/webhooks/video", () => {
  it("transmet le corps brut, octet pour octet, et la signature", async () => {
    const body = '{ "id" : "event-1",\n "type":"stream.started" }';

    await withWebhook(ok({ status: "recorded" }), async (url, received) => {
      await post(url, body, "t=1,v1=abc");

      expect(received).toEqual([{ body: Buffer.from(body), signature: "t=1,v1=abc" }]);
    });
  });

  it("transmet un corps qui n'est pas du JSON sans le refuser avant la signature", async () => {
    await withWebhook(err("invalid_signature"), async (url, received) => {
      const response = await post(url, "{pas du json", "t=1,v1=abc");

      expect(response.status).toBe(401);
      expect(received).toEqual([{ body: Buffer.from("{pas du json"), signature: "t=1,v1=abc" }]);
    });
  });

  it("transmet un corps vide, donc une signature refusée, si le corps a déjà été analysé", async () => {
    await withWebhook(
      err("invalid_signature"),
      async (url, received) => {
        const response = await post(url, '{"id":"event-1"}', "t=1,v1=abc");

        expect(response.status).toBe(401);
        expect(received).toEqual([{ body: Buffer.alloc(0), signature: "t=1,v1=abc" }]);
      },
      { rawBodies: false },
    );
  });

  it.each(["recorded", "already-processed", "unknown-channel"] as const)(
    "répond 204 quand l'event est %s",
    async (status) => {
      await withWebhook(ok({ status }), async (url) => {
        const response = await post(url, "{}", "t=1,v1=abc");

        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
      });
    },
  );

  it("répond 409 à une fin reçue avant son démarrage, pour que le provider la réémette", async () => {
    await withWebhook(ok({ status: "not-yet-started" }), async (url) => {
      const response = await post(url, "{}", "t=1,v1=abc");

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        status: 409,
        title: "Session pas encore démarrée",
      });
    });
  });

  it("répond 401 à une signature refusée", async () => {
    await withWebhook(err("invalid_signature"), async (url) => {
      const response = await post(url, "{}");

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ status: 401, title: "Signature invalide" });
    });
  });

  it("répond 400 à un webhook signé dont le contenu est invalide", async () => {
    await withWebhook(err("malformed_payload"), async (url) => {
      const response = await post(url, "{}", "t=1,v1=abc");

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ status: 400, title: "Webhook invalide" });
    });
  });

  it("refuse en 413 un corps de plus de 16 Kio, sans l'avoir lu", async () => {
    await withWebhook(ok({ status: "recorded" }), async (url, received) => {
      const response = await post(url, "x".repeat(16 * 1024 + 1), "t=1,v1=abc");

      expect(response.status).toBe(413);
      expect(received).toEqual([]);
    });
  });
});
