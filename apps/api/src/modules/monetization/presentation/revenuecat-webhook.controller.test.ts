import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { rejectingVerifier } from "../../../platform/authentication.ts";
import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { useRawWebhookBodies } from "../../../platform/raw-webhook-body.ts";
import {
  RECEIVE_REVENUECAT_WEBHOOK,
  type ReceiveRevenueCatWebhook,
  RevenueCatWebhookController,
} from "./revenuecat-webhook.controller.ts";

type Received = Parameters<ReceiveRevenueCatWebhook>[0];

const withWebhook = async (
  answer: Awaited<ReturnType<ReceiveRevenueCatWebhook>>,
  run: (url: string, received: Received[]) => Promise<void>,
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
    controllers: [RevenueCatWebhookController],
    providers: [
      {
        provide: RECEIVE_REVENUECAT_WEBHOOK,
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
  useRawWebhookBodies(app);
  app.useBodyParser("json");
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1/webhooks/revenuecat`, received);
  } finally {
    await app.close();
  }
};

const BODY = '{"api_version":"1.0","event":{"id":"evt-1"}}';

const deliver = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: BODY,
  });

describe("POST /v1/webhooks/revenuecat", () => {
  it.each(["recorded", "duplicate"] as const)(
    "répond 200 sans corps à un événement %s",
    async (outcome) => {
      await withWebhook(ok(outcome), async (url) => {
        const response = await deliver(url, { authorization: "Bearer attendu" });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("");
      });
    },
  );

  it("transmet l'en-tête Authorization et le corps brut", async () => {
    await withWebhook(ok("recorded"), async (url, received) => {
      await deliver(url, { authorization: "Bearer attendu" });

      expect(received).toEqual([{ authorization: "Bearer attendu", body: Buffer.from(BODY) }]);
    });
  });

  it("transmet un en-tête absent comme absent", async () => {
    await withWebhook(ok("recorded"), async (url, received) => {
      await deliver(url);

      expect(received[0]?.authorization).toBeUndefined();
    });
  });

  it.each([
    ["unauthorized", 401, "Authorization invalide"],
    ["malformed", 400, "Webhook invalide"],
    ["not_configured", 503, "Webhook RevenueCat non configuré"],
  ] as const)("répond à une erreur %s par %i en problem+json", async (error, status, title) => {
    await withWebhook(err(error), async (url) => {
      const response = await deliver(url, { authorization: "Bearer attendu" });

      expect(response.status).toBe(status);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({ status, title });
    });
  });
});
