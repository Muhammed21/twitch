import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkResponseSchema, realtime } from "../index.ts";

const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const AUTHOR_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const MESSAGE_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SESSION_ID = "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918";

const makeSend = (overrides: Record<string, unknown> = {}) => ({
  channelId: CHANNEL_ID,
  body: "Bonjour le chat",
  ...overrides,
});

const makeChatMessage = (overrides: Record<string, unknown> = {}) => ({
  id: MESSAGE_ID,
  channelId: CHANNEL_ID,
  author: { id: AUTHOR_ID, displayName: "Viewer de test" },
  body: "Bonjour le chat",
  sentAt: "2026-11-03T20:15:00.000Z",
  ...overrides,
});

const parses = (schema: z.ZodType | undefined, payload: unknown) =>
  schema?.safeParse(payload).success;

const definitionOf = (schema: z.ZodType, name: string) => z.toJSONSchema(schema).$defs?.[name];

describe("table des événements client", () => {
  it("associe chaque événement client à son schéma", () => {
    expect(Object.keys(realtime.clientEvents).toSorted()).toEqual([
      "chat:send",
      "room:join",
      "room:leave",
    ]);
  });

  it.each(["chat:message", "chat:delete", "", "toString", "constructor", "__proto__"])(
    "ne donne aucun schéma à l'événement inconnu « %s »",
    (event) => {
      expect(realtime.clientEventSchema(event)).toBeUndefined();
    },
  );

  it("donne à chat:send le schéma de l'envoi d'un message", () => {
    expect(realtime.clientEventSchema("chat:send")).toBe(realtime.RealtimeChatSend);
  });
});

describe("chat:send", () => {
  it("décode un message posté dans le salon d'une chaîne", () => {
    expect(realtime.RealtimeChatSend.parse(makeSend())).toEqual(makeSend());
  });

  it("accepte un corps de 500 caractères", () => {
    expect(parses(realtime.RealtimeChatSend, makeSend({ body: "a".repeat(500) }))).toBe(true);
  });

  it.each([
    ["au corps vide", makeSend({ body: "" })],
    ["au corps de 501 caractères", makeSend({ body: "a".repeat(501) })],
    ["sans corps", makeSend({ body: undefined })],
    ["sans chaîne", makeSend({ channelId: undefined })],
    ["à une chaîne qui n'est pas un UUID", makeSend({ channelId: "chaine-1" })],
    ["qui porte un champ inconnu", makeSend({ sessionId: SESSION_ID })],
  ])("refuse un message %s", (_name, payload) => {
    expect(parses(realtime.clientEventSchema("chat:send"), payload)).toBe(false);
  });
});

describe.each(["room:join", "room:leave"])("%s", (event) => {
  it("décode le salon d'une chaîne", () => {
    expect(realtime.clientEventSchema(event)?.parse({ channelId: CHANNEL_ID })).toEqual({
      channelId: CHANNEL_ID,
    });
  });

  it.each([
    ["sans chaîne", {}],
    ["à une chaîne qui n'est pas un UUID", { channelId: "chaine-1" }],
    ["qui porte un champ inconnu", { channelId: CHANNEL_ID, slug: "streamer" }],
  ])("refuse une demande %s", (_name, payload) => {
    expect(parses(realtime.clientEventSchema(event), payload)).toBe(false);
  });
});

describe("table des événements serveur", () => {
  it("associe chaque événement serveur à sa charge utile", () => {
    expect(realtime.serverEvents).toEqual({
      "chat:message": realtime.RealtimeChatMessage,
      "chat:rejected": realtime.RealtimeChatRejected,
      "session:revoked": realtime.RealtimeSessionRevoked,
    });
  });

  it.each(Object.values(realtime.serverEvents))(
    "publie une charge utile qui respecte les conventions de l'ADR 0024",
    (schema) => {
      expect(checkResponseSchema("charge utile", schema)).toEqual([]);
    },
  );

  it("respecte les conventions de l'ADR 0024 dans l'union des messages serveur", () => {
    expect(checkResponseSchema("RealtimeServerMessage", realtime.RealtimeServerMessage)).toEqual(
      [],
    );
  });
});

describe("schémas nommés", () => {
  it.each([
    ["RealtimeChatSend", realtime.RealtimeChatSend],
    ["RealtimeRoomJoin", realtime.clientEvents["room:join"]],
    ["RealtimeRoomLeave", realtime.clientEvents["room:leave"]],
    ["RealtimeChatMessage", realtime.RealtimeChatMessage],
    ["RealtimeChatRejected", realtime.RealtimeChatRejected],
    ["RealtimeSessionRevoked", realtime.RealtimeSessionRevoked],
    ["RealtimeServerMessage", realtime.RealtimeServerMessage],
  ])("publie %s sous son nom", (name, schema) => {
    expect(z.globalRegistry.get(schema)?.id).toBe(name);
  });
});

describe("contrat publié pour le client Swift", () => {
  it("nomme l'auteur d'un message pour qu'il devienne un type à part", () => {
    expect(definitionOf(realtime.RealtimeChatMessage, "RealtimeChatAuthor")).toMatchObject({
      required: ["id", "displayName"],
    });
  });

  it("publie les motifs de refus connus, en plus d'un motif libre", () => {
    expect(definitionOf(realtime.RealtimeChatRejected, "RealtimeChatRejected")).toMatchObject({
      properties: {
        reason: { anyOf: [{ enum: ["timed_out", "rate_limited"] }, { type: "string" }] },
      },
    });
  });

  it("publie les actions de révocation connues, en plus d'une action libre", () => {
    expect(definitionOf(realtime.RealtimeSessionRevoked, "RealtimeSessionRevoked")).toMatchObject({
      properties: {
        action: { anyOf: [{ enum: ["refresh_and_reconnect", "stop"] }, { type: "string" }] },
      },
    });
  });

  it("publie une variante par événement serveur, puis la variante de repli", () => {
    const union = definitionOf(realtime.RealtimeServerMessage, "RealtimeServerMessage");

    expect(union).toEqual({
      anyOf: [
        ...Object.keys(realtime.serverEvents).map((event) =>
          expect.objectContaining({
            properties: { event: { type: "string", const: event }, data: expect.anything() },
          }),
        ),
        expect.objectContaining({ properties: { event: { type: "string" } } }),
      ],
    });
  });
});

describe("chat:message", () => {
  it("décode un message hors live, sans session", () => {
    expect(realtime.RealtimeChatMessage.parse(makeChatMessage())).toEqual(makeChatMessage());
  });

  it("décode un message posté pendant un live, avec sa session", () => {
    expect(
      realtime.RealtimeChatMessage.parse(makeChatMessage({ sessionId: SESSION_ID })),
    ).toMatchObject({ sessionId: SESSION_ID });
  });

  it("garde un champ ajouté plus tard par le serveur", () => {
    expect(
      realtime.RealtimeChatMessage.parse(makeChatMessage({ firstMessage: true })),
    ).toMatchObject({ firstMessage: true });
  });

  it.each([
    ["sans identifiant", makeChatMessage({ id: undefined })],
    ["sans chaîne", makeChatMessage({ channelId: undefined })],
    ["à une session qui n'est pas un UUID", makeChatMessage({ sessionId: "live-1" })],
    ["sans auteur", makeChatMessage({ author: undefined })],
    ["à un auteur sans nom d'affichage", makeChatMessage({ author: { id: AUTHOR_ID } })],
    [
      "à un auteur sans identifiant",
      makeChatMessage({ author: { displayName: "Viewer de test" } }),
    ],
    ["sans corps", makeChatMessage({ body: undefined })],
    ["à une date qui n'est pas ISO 8601", makeChatMessage({ sentAt: "hier soir" })],
  ])("refuse un message %s", (_name, payload) => {
    expect(parses(realtime.RealtimeChatMessage, payload)).toBe(false);
  });
});

describe("chat:rejected", () => {
  it.each(["timed_out", "rate_limited", "slow_mode"])("décode le motif %s", (reason) => {
    expect(realtime.RealtimeChatRejected.parse({ reason })).toEqual({ reason });
  });

  it("refuse un refus sans motif", () => {
    expect(parses(realtime.RealtimeChatRejected, {})).toBe(false);
  });
});

describe("session:revoked", () => {
  it.each(["refresh_and_reconnect", "stop", "upgrade_required"])("décode l'action %s", (action) => {
    expect(realtime.RealtimeSessionRevoked.parse({ action })).toEqual({ action });
  });

  it("refuse une révocation sans action", () => {
    expect(parses(realtime.RealtimeSessionRevoked, {})).toBe(false);
  });
});

describe("RealtimeServerMessage", () => {
  it.each([
    ["chat:message", makeChatMessage()],
    ["chat:rejected", { reason: "rate_limited" }],
    ["session:revoked", { action: "stop" }],
  ])("décode l'événement %s avec sa charge utile", (event, data) => {
    expect(realtime.RealtimeServerMessage.parse({ event, data })).toEqual({ event, data });
  });

  it("décode un événement ajouté plus tard par le serveur dans la variante de repli", () => {
    expect(
      realtime.RealtimeServerMessage.parse({ event: "room:announcement", data: { text: "!" } }),
    ).toEqual({ event: "room:announcement", data: { text: "!" } });
  });

  it("décode une charge utile qui ne correspond pas à son événement dans la variante de repli", () => {
    const decoded = realtime.RealtimeServerMessage.parse({
      event: "session:revoked",
      data: { reason: "rate_limited" },
    });

    expect(realtime.RealtimeSessionRevoked.safeParse(decoded.data).success).toBe(false);
  });

  it("refuse un message sans nom d'événement", () => {
    expect(parses(realtime.RealtimeServerMessage, { data: { action: "stop" } })).toBe(false);
  });
});
