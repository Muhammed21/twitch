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
