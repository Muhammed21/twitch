import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import type { LiveVideoProviderPort, RawWebhook } from "./live-video-provider.ts";
import { receiveProviderWebhook } from "./receive-provider-webhook.ts";
import type { LifecycleOutcome, ProviderLifecycleEvent } from "./record-stream-lifecycle.ts";

const RECEIVED_AT = new Date("2026-10-15T20:00:05.000Z");

const EVENT: ProviderLifecycleEvent = {
  eventId: "0e1d2c3b-4a59-4687-9a1b-2c3d4e5f6a7b",
  kind: "started",
  providerChannelId: "provider-channel",
  providerSessionId: "provider-session",
  occurredAt: new Date("2026-10-15T20:00:00.000Z"),
};

const setup = (parsed: ReturnType<LiveVideoProviderPort["parseLifecycleWebhook"]>) => {
  const seen: RawWebhook[] = [];
  const recorded: ProviderLifecycleEvent[] = [];
  const receive = receiveProviderWebhook({
    provider: {
      parseLifecycleWebhook: (raw) => {
        seen.push(raw);
        return parsed;
      },
    },
    record: async (event): Promise<LifecycleOutcome> => {
      recorded.push(event);
      return { status: "recorded" };
    },
    now: () => RECEIVED_AT,
  });
  return { seen, recorded, receive };
};

const BODY = Buffer.from("{}");

describe("réception d'un webhook du provider vidéo", () => {
  it("fait lire le webhook par le provider, à l'heure de réception, puis enregistre l'event", async () => {
    const { seen, recorded, receive } = setup(ok(EVENT));

    const outcome = await receive({ body: BODY, signature: "t=1,v1=abc" });

    expect(seen).toEqual([{ body: BODY, signature: "t=1,v1=abc", receivedAt: RECEIVED_AT }]);
    expect(recorded).toEqual([EVENT]);
    expect(outcome).toEqual({ ok: true, value: { status: "recorded" } });
  });

  it.each(["invalid_signature", "malformed_payload"] as const)(
    "n'enregistre rien quand le provider refuse le webhook (%s)",
    async (error) => {
      const { recorded, receive } = setup(err(error));

      expect(await receive({ body: BODY, signature: undefined })).toEqual({ ok: false, error });
      expect(recorded).toEqual([]);
    },
  );
});
