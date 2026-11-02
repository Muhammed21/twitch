import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { signWebhook } from "../../../../platform/webhook-signature.ts";
import type { LiveVideoProviderPort } from "../../application/live-video-provider.ts";

const RECEIVED_AT = new Date("2026-10-15T20:00:05.000Z");
const SIX_MINUTES_AGO = new Date(RECEIVED_AT.getTime() - 6 * 60 * 1000);

type WebhookBody = Readonly<Record<string, unknown>>;

const makeWebhookBody = (overrides: WebhookBody = {}): WebhookBody => ({
  id: randomUUID(),
  type: "stream.started",
  channelId: "provider-channel",
  sessionId: "provider-session",
  occurredAt: "2026-10-15T20:00:00.000Z",
  ...overrides,
});

export const describeLiveVideoProviderContract = ({
  name,
  webhookSecret,
  provider,
}: {
  name: string;
  webhookSecret: string;
  provider: () => LiveVideoProviderPort;
}): void => {
  const deliver = ({
    port,
    body,
    secret = webhookSecret,
    signedAt = RECEIVED_AT,
  }: {
    port: LiveVideoProviderPort;
    body: string;
    secret?: string;
    signedAt?: Date;
  }) => {
    const bytes = Buffer.from(body);
    return port.parseLifecycleWebhook({
      body: bytes,
      signature: signWebhook({ secret, body: bytes, at: signedAt }),
      receivedAt: RECEIVED_AT,
    });
  };

  const keyOf = async (port: LiveVideoProviderPort, providerChannelId: string) =>
    (await port.getStreamKey({ providerChannelId }))?.streamKey;

  describe(`contrat de LiveVideoProviderPort : ${name}`, () => {
    it("provisionne une chaîne une seule fois, même appelé deux fois", async () => {
      const port = provider();
      const channelId = randomUUID();

      const first = await port.provisionChannel({ channelId });
      const second = await port.provisionChannel({ channelId });

      expect(first.providerChannelId).not.toBe("");
      expect(second).toEqual(first);
    });

    it("donne des canaux distincts à deux chaînes", async () => {
      const port = provider();
      const first = await port.provisionChannel({ channelId: randomUUID() });
      const second = await port.provisionChannel({ channelId: randomUUID() });

      expect(second.providerChannelId).not.toBe(first.providerChannelId);
    });

    it("rend la clé et l'URL d'ingest RTMP d'un canal provisionné", async () => {
      const port = provider();
      const { providerChannelId } = await port.provisionChannel({ channelId: randomUUID() });

      expect(await port.getStreamKey({ providerChannelId })).toEqual({
        streamKey: expect.stringMatching(/^\S{16,}$/),
        ingestUrl: expect.stringMatching(/^rtmps?:\/\//),
      });
    });

    it("ne rend aucune clé pour un canal inconnu", async () => {
      const port = provider();
      expect(await port.getStreamKey({ providerChannelId: "inconnu" })).toBeNull();
    });

    it("remplace la clé d'un canal à la rotation, sans toucher aux autres canaux", async () => {
      const port = provider();
      const rotated = await port.provisionChannel({ channelId: randomUUID() });
      const other = await port.provisionChannel({ channelId: randomUUID() });
      const before = await keyOf(port, rotated.providerChannelId);
      const otherBefore = await keyOf(port, other.providerChannelId);

      await port.revokeStreamKey({ providerChannelId: rotated.providerChannelId });

      const after = await keyOf(port, rotated.providerChannelId);
      expect(after).toEqual(expect.any(String));
      expect(after).not.toBe(before);
      expect(await keyOf(port, rotated.providerChannelId)).toBe(after);
      expect(await keyOf(port, other.providerChannelId)).toBe(otherBefore);
    });

    it("ne crée pas de clé en faisant tourner celle d'un canal inconnu", async () => {
      const port = provider();
      await port.revokeStreamKey({ providerChannelId: "inconnu" });

      expect(await port.getStreamKey({ providerChannelId: "inconnu" })).toBeNull();
    });

    it("ne diffuse aucune session avant le premier live", async () => {
      const port = provider();
      expect(await port.listLiveSessions()).toEqual([]);
    });

    it.each(["stream.started", "stream.ended"] as const)("lit un webhook %s signé", (type) => {
      const port = provider();
      const body = makeWebhookBody({ type });

      expect(deliver({ port, body: JSON.stringify(body) })).toEqual({
        ok: true,
        value: {
          eventId: body["id"],
          kind: type === "stream.started" ? "started" : "ended",
          providerChannelId: "provider-channel",
          providerSessionId: "provider-session",
          occurredAt: new Date("2026-10-15T20:00:00.000Z"),
        },
      });
    });

    it("refuse un webhook signé avec un autre secret, sans lire un corps qui n'est pas du JSON", () => {
      const port = provider();
      expect(
        deliver({ port, body: "pas du json", secret: "un-autre-secret-de-webhook-video" }),
      ).toEqual({ ok: false, error: "invalid_signature" });
    });

    it("refuse un webhook signé il y a plus de 5 minutes", () => {
      const port = provider();
      expect(
        deliver({ port, body: JSON.stringify(makeWebhookBody()), signedAt: SIX_MINUTES_AGO }),
      ).toEqual({ ok: false, error: "invalid_signature" });
    });

    it.each([
      ["un corps qui n'est pas du JSON", "pas du json"],
      ["un démarrage sans session", JSON.stringify(makeWebhookBody({ sessionId: undefined }))],
      ["un event sans date", JSON.stringify(makeWebhookBody({ occurredAt: undefined }))],
      ["un event de type inconnu sans identifiant", JSON.stringify({ type: "stream.paused" })],
    ])("refuse un webhook signé dont le contenu est invalide : %s", (_, body) => {
      const port = provider();
      expect(deliver({ port, body })).toEqual({ ok: false, error: "malformed_payload" });
    });

    it("acquitte sans effet un webhook signé d'un type qu'il ne connaît pas", async () => {
      const port = provider();
      const body = makeWebhookBody({ type: "stream.thumbnail_ready" });

      const before = await port.listLiveSessions();

      expect(deliver({ port, body: JSON.stringify(body) })).toEqual({
        ok: true,
        value: { kind: "ignored", eventId: body["id"] },
      });
      expect(await port.listLiveSessions()).toEqual(before);
    });
  });
};
