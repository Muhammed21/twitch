import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";
import { err } from "@repo/result";

import { configureApp } from "../../../platform/configure-app.ts";
import { PlatformModule } from "../../../platform/platform.module.ts";
import { getPlayback } from "../application/playback.ts";
import { GET_PLAYBACK, PlaybackController } from "./playback.controller.ts";

const LIVE_CHANNEL_ID = "00000000-0000-4000-8000-000000000001";
const OFFLINE_CHANNEL_ID = "00000000-0000-4000-8000-000000000002";
const PROVIDER_CHANNEL_ID = "0c9f3b2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const PLAYBACK_BASE_URL = "http://127.0.0.1:3002";

const withPlayback = async (
  run: (get: (channelId: string) => Promise<Response>) => Promise<void>,
  { baseUrl = PLAYBACK_BASE_URL }: { baseUrl?: string } = {},
) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: { verify: async () => err("invalid_token") },
      }),
    ],
    controllers: [PlaybackController],
    providers: [
      {
        provide: GET_PLAYBACK,
        useValue: getPlayback({
          sessions: {
            liveProviderChannelOf: async (channelId) =>
              channelId === LIVE_CHANNEL_ID ? PROVIDER_CHANNEL_ID : null,
          },
          baseUrl,
        }),
      },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  try {
    await run((channelId) => fetch(`${url}/v1/channels/${channelId}/playback`));
  } finally {
    await app.close();
  }
};

describe("GET /v1/channels/{channelId}/playback (ADR 0031 §6)", () => {
  it("rend la playlist maître du canal provider de la chaîne en live, sans authentification", async () => {
    await withPlayback(async (get) => {
      const response = await get(LIVE_CHANNEL_ID);

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        playbackUrl: `http://127.0.0.1:3002/hls/channels/${PROVIDER_CHANNEL_ID}/master.m3u8`,
      });
    });
  });

  it.each(["https://cdn.example.test/video", "https://cdn.example.test/video/"])(
    "garde le chemin de la base de lecture %s",
    async (baseUrl) => {
      await withPlayback(
        async (get) => {
          expect(responses.Playback.parse(await (await get(LIVE_CHANNEL_ID)).json())).toEqual({
            playbackUrl: `https://cdn.example.test/video/hls/channels/${PROVIDER_CHANNEL_ID}/master.m3u8`,
          });
        },
        { baseUrl },
      );
    },
  );

  it("répond 404 pour une chaîne sans session ouverte", async () => {
    await withPlayback(async (get) => {
      const response = await get(OFFLINE_CHANNEL_ID);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(responses.Problem.parse(await response.json())).toMatchObject({
        status: 404,
        title: "Chaîne hors live",
      });
    });
  });

  it("refuse en 400 un identifiant de chaîne qui n'est pas un UUID", async () => {
    await withPlayback(async (get) => {
      const response = await get("42");

      expect(response.status).toBe(400);
      expect(responses.Problem.parse(await response.json()).errors).toContainEqual(
        expect.objectContaining({ path: "channelId" }),
      );
    });
  });
});
