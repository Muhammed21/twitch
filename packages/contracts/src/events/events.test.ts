import { describe, expect, it } from "vitest";

import { events } from "../index.ts";

const ACCOUNT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";

const makeRegistration = (overrides: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT_ID,
  displayName: "Streamer de test",
  ...overrides,
});

const makeChannelCreated = (overrides: Record<string, unknown> = {}) => ({
  channelId: CHANNEL_ID,
  ownerId: ACCOUNT_ID,
  slug: "streamer_de_test",
  ...overrides,
});

describe("identity.account.registered", () => {
  it("porte son nom et sa version", () => {
    expect(events.identity.accountRegistered).toMatchObject({
      name: "identity.account.registered",
      version: 1,
    });
  });

  it("décode le compte inscrit et son nom d'affichage", () => {
    expect(events.identity.accountRegistered.payload.parse(makeRegistration())).toEqual({
      accountId: ACCOUNT_ID,
      displayName: "Streamer de test",
    });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.identity.accountRegistered.payload.parse(makeRegistration({ locale: "fr" })),
    ).toMatchObject({ locale: "fr" });
  });

  it.each([
    ["sans compte", makeRegistration({ accountId: undefined })],
    [
      "avec un compte qui n'est pas un UUID",
      makeRegistration({ accountId: "FWGDz5f2dSosyWpO6un25VBOMSsnkVjk" }),
    ],
    ["sans nom d'affichage", makeRegistration({ displayName: undefined })],
    ["avec un nom d'affichage qui n'est pas un texte", makeRegistration({ displayName: 42 })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.identity.accountRegistered.payload.safeParse(payload).success).toBe(false);
  });
});

describe("channel.created", () => {
  it("porte son nom et sa version", () => {
    expect(events.channel.channelCreated).toMatchObject({ name: "channel.created", version: 1 });
  });

  it("décode la chaîne créée, son propriétaire et son slug", () => {
    expect(events.channel.channelCreated.payload.parse(makeChannelCreated())).toEqual({
      channelId: CHANNEL_ID,
      ownerId: ACCOUNT_ID,
      slug: "streamer_de_test",
    });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.channel.channelCreated.payload.parse(makeChannelCreated({ title: "Mon live" })),
    ).toMatchObject({ title: "Mon live" });
  });

  it.each([
    ["sans chaîne", makeChannelCreated({ channelId: undefined })],
    ["avec une chaîne qui n'est pas un UUID", makeChannelCreated({ channelId: "chaine-1" })],
    ["sans propriétaire", makeChannelCreated({ ownerId: undefined })],
    ["avec un propriétaire qui n'est pas un UUID", makeChannelCreated({ ownerId: "moi" })],
    ["sans slug", makeChannelCreated({ slug: undefined })],
    ["avec un slug qui n'est pas un texte", makeChannelCreated({ slug: 42 })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCreated.payload.safeParse(payload).success).toBe(false);
  });
});

describe("channel.metadata.updated", () => {
  const makeUpdate = (overrides: Record<string, unknown> = {}) => ({
    channelId: CHANNEL_ID,
    title: "Speedrun du dimanche",
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelMetadataUpdated).toMatchObject({
      name: "channel.metadata.updated",
      version: 1,
    });
  });

  it("décode la chaîne et son nouveau titre", () => {
    expect(events.channel.channelMetadataUpdated.payload.parse(makeUpdate())).toEqual(makeUpdate());
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.channel.channelMetadataUpdated.payload.parse(makeUpdate({ category: "jeux" })),
    ).toMatchObject({ category: "jeux" });
  });

  it.each([
    ["sans chaîne", makeUpdate({ channelId: undefined })],
    ["avec une chaîne qui n'est pas un UUID", makeUpdate({ channelId: "chaine-1" })],
    ["sans titre", makeUpdate({ title: undefined })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelMetadataUpdated.payload.safeParse(payload).success).toBe(false);
  });
});

const SESSION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe.each([
  ["stream.started", () => events.stream.streamStarted, "startedAt"],
  ["stream.ended", () => events.stream.streamEnded, "endedAt"],
] as const)("%s", (name, contractOf, dateField) => {
  const makeLifecycle = (overrides: Record<string, unknown> = {}) => ({
    sessionId: SESSION_ID,
    channelId: CHANNEL_ID,
    [dateField]: "2026-10-15T20:00:00.000Z",
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(contractOf()).toMatchObject({ name, version: 1 });
  });

  it("décode la session, sa chaîne et sa date", () => {
    expect(contractOf().payload.parse(makeLifecycle())).toEqual(makeLifecycle());
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(contractOf().payload.parse(makeLifecycle({ category: "jeux" }))).toMatchObject({
      category: "jeux",
    });
  });

  it.each([
    ["sans session", { sessionId: undefined }],
    ["avec une session qui n'est pas un UUID", { sessionId: "session-1" }],
    ["sans chaîne", { channelId: undefined }],
    ["avec une chaîne qui n'est pas un UUID", { channelId: "chaine-1" }],
    ["sans date", { [dateField]: undefined }],
    ["avec une date sans fuseau", { [dateField]: "2026-10-15T20:00:00" }],
  ])("refuse un event %s", (_name, overrides) => {
    expect(contractOf().payload.safeParse(makeLifecycle(overrides)).success).toBe(false);
  });
});

describe("moderation.user.timed_out", () => {
  const USER_ID = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

  const makeTimeout = (overrides: Record<string, unknown> = {}) => ({
    channelId: CHANNEL_ID,
    userId: USER_ID,
    expiresAt: "2026-10-15T20:10:00.000Z",
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.moderation.userTimedOut).toMatchObject({
      name: "moderation.user.timed_out",
      version: 1,
    });
  });

  it("décode la chaîne, l'utilisateur sanctionné et la fin du timeout", () => {
    expect(events.moderation.userTimedOut.payload.parse(makeTimeout())).toEqual(makeTimeout());
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.moderation.userTimedOut.payload.parse(makeTimeout({ reason: "spam" })),
    ).toMatchObject({ reason: "spam" });
  });

  it.each([
    ["sans chaîne", { channelId: undefined }],
    ["avec une chaîne qui n'est pas un UUID", { channelId: "chaine-1" }],
    ["sans utilisateur", { userId: undefined }],
    ["avec un utilisateur qui n'est pas un UUID", { userId: "viewer" }],
    ["sans fin", { expiresAt: undefined }],
    ["avec une fin sans fuseau", { expiresAt: "2026-10-15T20:10:00" }],
  ])("refuse un event %s", (_name, overrides) => {
    expect(events.moderation.userTimedOut.payload.safeParse(makeTimeout(overrides)).success).toBe(
      false,
    );
  });
});
