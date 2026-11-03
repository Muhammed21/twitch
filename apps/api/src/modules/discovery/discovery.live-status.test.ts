import { setTimeout as sleep } from "node:timers/promises";

import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { responses } from "@repo/contracts";

import { rejectingVerifier } from "../../platform/authentication.ts";
import { configureApp } from "../../platform/configure-app.ts";
import { PlatformModule } from "../../platform/platform.module.ts";
import {
  type ChannelLiveStatus,
  createLiveStatusHub,
  type LiveStatusHub,
  type LiveStatusReader,
} from "./application/live-status-hub.ts";
import {
  LIVE_STATUS_HEARTBEAT_MS,
  LIVE_STATUS_HUB,
  LiveStatusController,
} from "./presentation/live-status.controller.ts";

const LIVE_CHANNEL = "00000000-0000-4000-8000-000000000001";
const OFFLINE_CHANNEL = "00000000-0000-4000-8000-000000000002";
const UNKNOWN_CHANNEL = "00000000-0000-4000-8000-000000000003";

const STARTED_AT = new Date("2026-11-03T20:00:00.000Z");

const HEARTBEAT_MS = 50;

const makeProjection = () => {
  const state = new Map<string, ChannelLiveStatus>([
    [LIVE_CHANNEL, { channelId: LIVE_CHANNEL, startedAt: STARTED_AT }],
    [OFFLINE_CHANNEL, { channelId: OFFLINE_CHANNEL, startedAt: undefined }],
  ]);
  const reads: (readonly string[])[] = [];
  const gate: { opened: Promise<void> } = { opened: Promise.resolve() };
  const reader: LiveStatusReader = {
    read: async (channelIds) => {
      reads.push(channelIds);
      await gate.opened;
      return channelIds.flatMap((channelId) => state.get(channelId) ?? []);
    },
  };
  return {
    reader,
    reads,
    hold: () => {
      const release = { open: () => {} };
      gate.opened = new Promise<void>((resolve) => {
        release.open = resolve;
      });
      return () => {
        gate.opened = Promise.resolve();
        release.open();
      };
    },
    set: (status: ChannelLiveStatus) => {
      state.set(status.channelId, status);
    },
  };
};

type Projection = ReturnType<typeof makeProjection>;

const withLiveStatus = async (
  run: (context: {
    url: string;
    hub: LiveStatusHub;
    projection: Projection;
    close: () => Promise<void>;
  }) => Promise<void>,
) => {
  const projection = makeProjection();
  const hub = createLiveStatusHub(projection.reader);
  const moduleRef = await Test.createTestingModule({
    imports: [
      PlatformModule.register({
        schemaVersionCheck: async () => {},
        logSink: () => {},
        accessTokenVerifier: rejectingVerifier,
      }),
    ],
    controllers: [LiveStatusController],
    providers: [
      { provide: LIVE_STATUS_HUB, useValue: hub },
      { provide: LIVE_STATUS_HEARTBEAT_MS, useValue: HEARTBEAT_MS },
    ],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.listen(0, "127.0.0.1");
  const closing = { done: false };
  const close = async () => {
    if (!closing.done) {
      closing.done = true;
      await app.close();
    }
  };
  try {
    await run({ url: `${await app.getUrl()}/v1/channels`, hub, projection, close });
  } finally {
    await close();
  }
};

type SseFrame = { event?: string; data?: unknown; comment?: string };

const parseFrame = (frame: string): SseFrame =>
  frame.split("\n").reduce<SseFrame>((parsed, line) => {
    if (line.startsWith(":")) {
      return { ...parsed, comment: line.slice(1).trim() };
    }
    if (line.startsWith("event: ")) {
      return { ...parsed, event: line.slice("event: ".length) };
    }
    if (line.startsWith("data: ")) {
      return { ...parsed, data: JSON.parse(line.slice("data: ".length)) };
    }
    return parsed;
  }, {});

const openStream = async (url: string) => {
  const aborting = new AbortController();
  const response = await fetch(url, { signal: aborting.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("flux SSE sans corps");
  }
  const decoder = new TextDecoder();
  const buffered = { text: "", ended: false };
  const nextFrame = async (): Promise<SseFrame | undefined> => {
    const separator = buffered.text.indexOf("\n\n");
    if (separator !== -1) {
      const frame = buffered.text.slice(0, separator);
      buffered.text = buffered.text.slice(separator + 2);
      return parseFrame(frame);
    }
    const { done, value } = await reader.read();
    if (done) {
      buffered.ended = true;
      return undefined;
    }
    buffered.text += decoder.decode(value, { stream: true });
    return nextFrame();
  };
  const nextEvent = async (): Promise<SseFrame | undefined> => {
    const frame = await nextFrame();
    return frame === undefined || frame.event !== undefined ? frame : nextEvent();
  };
  return { response, nextFrame, nextEvent, abort: () => aborting.abort(), buffered };
};

describe("GET /v1/channels/{channelId}/live-status (canal 2, ADR 0004 §2)", () => {
  it("ouvre un flux SSE et envoie aussitôt l'état d'une chaîne en live", async () => {
    await withLiveStatus(async ({ url }) => {
      const stream = await openStream(`${url}/${LIVE_CHANNEL}/live-status`);

      expect(stream.response.status).toBe(200);
      expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
      expect(stream.response.headers.get("cache-control")).toBe("no-cache");
      expect(stream.response.headers.get("x-accel-buffering")).toBe("no");
      const first = await stream.nextEvent();
      expect(first?.event).toBe("status");
      expect(responses.LiveStatus.parse(first?.data)).toEqual({
        channelId: LIVE_CHANNEL,
        live: true,
        startedAt: STARTED_AT.toISOString(),
      });
      stream.abort();
    });
  });

  it("envoie l'état d'une chaîne hors live, sans démarrage", async () => {
    await withLiveStatus(async ({ url }) => {
      const stream = await openStream(`${url}/${OFFLINE_CHANNEL}/live-status`);

      expect((await stream.nextEvent())?.data).toEqual({ channelId: OFFLINE_CHANNEL, live: false });
      stream.abort();
    });
  });

  it("envoie le nouvel état au tick qui suit un changement", async () => {
    await withLiveStatus(async ({ url, hub, projection }) => {
      const stream = await openStream(`${url}/${OFFLINE_CHANNEL}/live-status`);
      await stream.nextEvent();

      projection.set({ channelId: OFFLINE_CHANNEL, startedAt: STARTED_AT });
      await hub.tick();

      expect((await stream.nextEvent())?.data).toEqual({
        channelId: OFFLINE_CHANNEL,
        live: true,
        startedAt: STARTED_AT.toISOString(),
      });
      stream.abort();
    });
  });

  it("envoie le nombre de viewers d'une chaîne en live, et son changement au tick", async () => {
    await withLiveStatus(async ({ url, hub, projection }) => {
      projection.set({ channelId: LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 0 });
      const stream = await openStream(`${url}/${LIVE_CHANNEL}/live-status`);

      expect((await stream.nextEvent())?.data).toEqual({
        channelId: LIVE_CHANNEL,
        live: true,
        startedAt: STARTED_AT.toISOString(),
        viewerCount: 0,
      });
      projection.set({ channelId: LIVE_CHANNEL, startedAt: STARTED_AT, viewerCount: 12 });
      await hub.tick();
      expect((await stream.nextEvent())?.data).toEqual({
        channelId: LIVE_CHANNEL,
        live: true,
        startedAt: STARTED_AT.toISOString(),
        viewerCount: 12,
      });
      stream.abort();
    });
  });

  it("garde la connexion ouverte par un commentaire SSE périodique", async () => {
    await withLiveStatus(async ({ url }) => {
      const stream = await openStream(`${url}/${LIVE_CHANNEL}/live-status`);
      await stream.nextEvent();

      expect(await stream.nextFrame()).toEqual({ comment: "ping" });
      stream.abort();
    });
  });

  it("refuse en 404 RFC 9457 une chaîne inconnue, sans ouvrir de flux", async () => {
    await withLiveStatus(async ({ url }) => {
      const response = await fetch(`${url}/${UNKNOWN_CHANNEL}/live-status`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(responses.Problem.parse(await response.json()).title).toBe("Chaîne introuvable");
    });
  });

  it("refuse en 400 RFC 9457 un identifiant qui n'est pas un UUID", async () => {
    await withLiveStatus(async ({ url, projection }) => {
      const response = await fetch(`${url}/42/live-status`);

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(responses.Problem.parse(await response.json()).errors).toContainEqual(
        expect.objectContaining({ path: "channelId" }),
      );
      expect(projection.reads).toEqual([]);
    });
  });

  it("ne lit plus la chaîne d'un client qui s'est déconnecté", async () => {
    await withLiveStatus(async ({ url, hub, projection }) => {
      const stream = await openStream(`${url}/${LIVE_CHANNEL}/live-status`);
      await stream.nextEvent();

      stream.abort();

      await expect
        .poll(async () => {
          const readsBefore = projection.reads.length;
          await hub.tick();
          return projection.reads.length - readsBefore;
        })
        .toBe(0);
    });
  });

  it("ne garde pas l'abonnement d'un client parti avant la fin de l'abonnement", async () => {
    await withLiveStatus(async ({ url, hub, projection }) => {
      const release = projection.hold();
      const aborting = new AbortController();
      const request = fetch(`${url}/${LIVE_CHANNEL}/live-status`, {
        signal: aborting.signal,
      }).catch(() => undefined);
      await expect.poll(() => projection.reads.length).toBe(1);

      aborting.abort();
      await request;
      await sleep(HEARTBEAT_MS);
      release();
      await sleep(HEARTBEAT_MS * 2);
      const readsBefore = projection.reads.length;
      await hub.tick();

      expect(projection.reads).toHaveLength(readsBefore);
    });
  });

  it("ferme les flux ouverts à l'arrêt de l'API", async () => {
    await withLiveStatus(async ({ url, close }) => {
      const stream = await openStream(`${url}/${LIVE_CHANNEL}/live-status`);
      await stream.nextEvent();

      await close();

      await expect.poll(async () => (await stream.nextFrame()) === undefined).toBe(true);
    });
  });
});
