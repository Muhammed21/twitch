import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { useRawWebhookBodies } from "./raw-webhook-body.ts";

@Controller()
class EchoController {
  @Post(["webhooks/echo", "channels/echo"])
  @HttpCode(200)
  echo(@Body() body: unknown) {
    return { raw: Buffer.isBuffer(body), body: Buffer.isBuffer(body) ? body.toString() : body };
  }
}

const withEcho = async (run: (base: string) => Promise<void>) => {
  const moduleRef = await Test.createTestingModule({ controllers: [EchoController] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  useRawWebhookBodies(app);
  app.useBodyParser("json");
  app.setGlobalPrefix("v1");
  await app.listen(0, "127.0.0.1");
  try {
    await run(`${await app.getUrl()}/v1`);
  } finally {
    await app.close();
  }
};

const postJson = (url: string) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"title":"Speedrun"}',
  });

describe("corps des webhooks", () => {
  it("garde le corps brut sous /v1/webhooks/", async () => {
    await withEcho(async (base) => {
      expect(await (await postJson(`${base}/webhooks/echo`)).json()).toEqual({
        raw: true,
        body: '{"title":"Speedrun"}',
      });
    });
  });

  it("laisse le JSON analysé sur les autres routes", async () => {
    await withEcho(async (base) => {
      expect(await (await postJson(`${base}/channels/echo`)).json()).toEqual({
        raw: false,
        body: { title: "Speedrun" },
      });
    });
  });
});
