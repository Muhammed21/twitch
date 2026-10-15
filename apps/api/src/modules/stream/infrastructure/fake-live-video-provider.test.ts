import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { fakeLifecycleWebhook, fakeLiveVideoProvider } from "./fake-live-video-provider.ts";

const SECRET = "secret-de-test";
const NOW = new Date("2026-10-15T20:00:00.000Z");

const makeWebhookEvent = (
  overrides: Partial<Parameters<typeof fakeLifecycleWebhook>[0]["event"]> = {},
): Parameters<typeof fakeLifecycleWebhook>[0]["event"] => ({
  id: randomUUID(),
  type: "stream.started",
  channelId: "provider-channel",
  sessionId: "provider-session-1",
  occurredAt: NOW,
  ...overrides,
});

const deliver = (
  provider: ReturnType<typeof fakeLiveVideoProvider>,
  event: Parameters<typeof fakeLifecycleWebhook>[0]["event"],
  signature?: string,
) => {
  const signed = fakeLifecycleWebhook({ secret: SECRET, event, at: NOW });
  return provider.parseLifecycleWebhook({
    body: Buffer.from(signed.body),
    signature: signature ?? signed.signature,
    receivedAt: NOW,
  });
};

describe("sessions en direct du provider factice", () => {
  it("ne diffuse rien avant le premier webhook", async () => {
    expect(await fakeLiveVideoProvider({ webhookSecret: SECRET }).listLiveSessions()).toEqual([]);
  });

  it("diffuse une session annoncée par un webhook de démarrage", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });

    deliver(provider, makeWebhookEvent({ sessionId: "provider-session-1" }));
    deliver(provider, makeWebhookEvent({ sessionId: "provider-session-2" }));

    expect(await provider.listLiveSessions()).toEqual([
      { providerSessionId: "provider-session-1" },
      { providerSessionId: "provider-session-2" },
    ]);
  });

  it("ne diffuse plus une session après son webhook de fin", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });

    deliver(provider, makeWebhookEvent({ sessionId: "provider-session-1" }));
    deliver(provider, makeWebhookEvent({ sessionId: "provider-session-2" }));
    deliver(provider, makeWebhookEvent({ type: "stream.ended", sessionId: "provider-session-1" }));

    expect(await provider.listLiveSessions()).toEqual([
      { providerSessionId: "provider-session-2" },
    ]);
  });

  it("ignore un webhook de démarrage mal signé", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });

    deliver(provider, makeWebhookEvent(), "t=1,v1=00");

    expect(await provider.listLiveSessions()).toEqual([]);
  });

  it("ne partage pas ses sessions avec un autre provider factice", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });
    deliver(provider, makeWebhookEvent());

    expect(await fakeLiveVideoProvider({ webhookSecret: SECRET }).listLiveSessions()).toEqual([]);
  });
});

const keyOf = async (
  provider: ReturnType<typeof fakeLiveVideoProvider>,
  providerChannelId: string,
) => (await provider.getStreamKey({ providerChannelId }))?.streamKey;

describe("rotation de la clé de stream du provider factice (ADR 0031)", () => {
  it("remplace la clé du canal, et ne rend plus l'ancienne", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });
    const { providerChannelId } = await provider.provisionChannel({ channelId: "chaine-a" });
    const before = await keyOf(provider, providerChannelId);

    await provider.revokeStreamKey({ providerChannelId });
    const after = await keyOf(provider, providerChannelId);

    expect(after).toMatch(/^sk_live_[0-9a-f]{32}$/);
    expect(after).not.toBe(before);
    expect(await keyOf(provider, providerChannelId)).toBe(after);
  });

  it("donne une nouvelle clé à chaque rotation", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });
    const { providerChannelId } = await provider.provisionChannel({ channelId: "chaine-a" });
    const first = await keyOf(provider, providerChannelId);

    await provider.revokeStreamKey({ providerChannelId });
    const second = await keyOf(provider, providerChannelId);
    await provider.revokeStreamKey({ providerChannelId });
    const third = await keyOf(provider, providerChannelId);

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("ne change pas la clé des autres canaux", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });
    const rotated = await provider.provisionChannel({ channelId: "chaine-a" });
    const other = await provider.provisionChannel({ channelId: "chaine-b" });
    const otherBefore = await keyOf(provider, other.providerChannelId);

    await provider.revokeStreamKey({ providerChannelId: rotated.providerChannelId });

    expect(await keyOf(provider, other.providerChannelId)).toBe(otherBefore);
  });

  it("ne crée pas de clé pour un canal qu'il ne connaît pas", async () => {
    const provider = fakeLiveVideoProvider({ webhookSecret: SECRET });

    await provider.revokeStreamKey({ providerChannelId: "inconnu" });

    expect(await provider.getStreamKey({ providerChannelId: "inconnu" })).toBeNull();
  });
});
