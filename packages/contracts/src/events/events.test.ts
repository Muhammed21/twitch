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

const AVATAR_KEY = "images/avatar/1f0e8d2c-3b4a-4c5d-8e6f-7a8b9c0d1e2f.webp";

const makeAvatarChange = (overrides: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT_ID,
  avatarKey: AVATAR_KEY,
  ...overrides,
});

describe("identity.avatar.changed", () => {
  it("porte son nom et sa version", () => {
    expect(events.identity.avatarChanged).toMatchObject({
      name: "identity.avatar.changed",
      version: 1,
    });
  });

  it("décode le compte et la clé de son nouvel avatar", () => {
    expect(events.identity.avatarChanged.payload.parse(makeAvatarChange())).toEqual({
      accountId: ACCOUNT_ID,
      avatarKey: AVATAR_KEY,
    });
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.identity.avatarChanged.payload.parse(makeAvatarChange({ width: 512 })),
    ).toMatchObject({ width: 512 });
  });

  it.each([
    ["sans compte", makeAvatarChange({ accountId: undefined })],
    ["avec un compte qui n'est pas un UUID", makeAvatarChange({ accountId: "moi" })],
    ["sans clé", makeAvatarChange({ avatarKey: undefined })],
    ["avec une clé vide", makeAvatarChange({ avatarKey: "" })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.identity.avatarChanged.payload.safeParse(payload).success).toBe(false);
  });
});

const makeChatColorChange = (overrides: Record<string, unknown> = {}) => ({
  accountId: ACCOUNT_ID,
  chatColor: "#9146FF",
  ...overrides,
});

describe("identity.chat_color.changed", () => {
  it("porte son nom et sa version", () => {
    expect(events.identity.chatColorChanged).toMatchObject({
      name: "identity.chat_color.changed",
      version: 1,
    });
  });

  it("décode le compte et sa nouvelle couleur de pseudo", () => {
    expect(events.identity.chatColorChanged.payload.parse(makeChatColorChange())).toEqual({
      accountId: ACCOUNT_ID,
      chatColor: "#9146FF",
    });
  });

  it("décode le retour à la couleur par défaut", () => {
    expect(
      events.identity.chatColorChanged.payload.parse(makeChatColorChange({ chatColor: null })),
    ).toEqual({ accountId: ACCOUNT_ID, chatColor: null });
  });

  it.each([
    ["sans compte", makeChatColorChange({ accountId: undefined })],
    ["sans couleur", makeChatColorChange({ chatColor: undefined })],
    ["avec une couleur en minuscules", makeChatColorChange({ chatColor: "#9146ff" })],
    ["avec une couleur sans dièse", makeChatColorChange({ chatColor: "9146FF" })],
    ["avec une couleur courte", makeChatColorChange({ chatColor: "#FFF" })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.identity.chatColorChanged.payload.safeParse(payload).success).toBe(false);
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
    ["sa catégorie", "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f"],
    ["l'absence de catégorie", null],
  ])("décode %s", (_name, categoryId) => {
    expect(events.channel.channelMetadataUpdated.payload.parse(makeUpdate({ categoryId }))).toEqual(
      makeUpdate({ categoryId }),
    );
  });

  it.each([
    ["sans chaîne", makeUpdate({ channelId: undefined })],
    ["avec une chaîne qui n'est pas un UUID", makeUpdate({ channelId: "chaine-1" })],
    ["sans titre", makeUpdate({ title: undefined })],
    ["avec une catégorie qui n'est pas un UUID", makeUpdate({ categoryId: "jeux" })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelMetadataUpdated.payload.safeParse(payload).success).toBe(false);
  });
});

const SESSION_ID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const CATEGORY_ID = "7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f";
const OTHER_CATEGORY_ID = "8d7e6f5a-4b3c-4d2e-9f0a-1b2c3d4e5f6a";

describe("channel.category.created", () => {
  const makeCreated = (overrides: Record<string, unknown> = {}) => ({
    categoryId: CATEGORY_ID,
    slug: "just-chatting",
    name: "Just Chatting",
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryCreated).toMatchObject({
      name: "channel.category.created",
      version: 1,
    });
  });

  it("décode la catégorie, son slug et son nom", () => {
    expect(events.channel.channelCategoryCreated.payload.parse(makeCreated())).toEqual(
      makeCreated(),
    );
  });

  it("garde un champ ajouté plus tard par l'émetteur", () => {
    expect(
      events.channel.channelCategoryCreated.payload.parse(makeCreated({ imageKey: "k" })),
    ).toMatchObject({ imageKey: "k" });
  });

  it.each([
    ["sans catégorie", makeCreated({ categoryId: undefined })],
    ["avec une catégorie qui n'est pas un UUID", makeCreated({ categoryId: "jeux" })],
    ["sans slug", makeCreated({ slug: undefined })],
    ["sans nom", makeCreated({ name: undefined })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCategoryCreated.payload.safeParse(payload).success).toBe(false);
  });
});

describe("channel.category.merged", () => {
  const makeMerged = (overrides: Record<string, unknown> = {}) => ({
    sourceCategoryId: CATEGORY_ID,
    targetCategoryId: OTHER_CATEGORY_ID,
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryMerged).toMatchObject({
      name: "channel.category.merged",
      version: 1,
    });
  });

  it("décode la catégorie fusionnée et sa cible", () => {
    expect(events.channel.channelCategoryMerged.payload.parse(makeMerged())).toEqual(makeMerged());
  });

  it.each([
    ["sans source", makeMerged({ sourceCategoryId: undefined })],
    ["avec une source qui n'est pas un UUID", makeMerged({ sourceCategoryId: "jeux" })],
    ["sans cible", makeMerged({ targetCategoryId: undefined })],
    ["avec une cible qui n'est pas un UUID", makeMerged({ targetCategoryId: "jeux" })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCategoryMerged.payload.safeParse(payload).success).toBe(false);
  });
});

describe("channel.category.updated", () => {
  const makeUpdated = (overrides: Record<string, unknown> = {}) => ({
    categoryId: CATEGORY_ID,
    name: "Just Chatting",
    imageKey: "images/category/3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d.webp",
    tags: ["IRL"],
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryUpdated).toMatchObject({
      name: "channel.category.updated",
      version: 1,
    });
  });

  it.each([
    ["avec sa pochette", makeUpdated()],
    ["sans pochette", makeUpdated({ imageKey: null })],
    ["sans tag", makeUpdated({ tags: [] })],
  ])("décode la catégorie %s", (_name, updated) => {
    expect(events.channel.channelCategoryUpdated.payload.parse(updated)).toEqual(updated);
  });

  it.each([
    ["sans catégorie", makeUpdated({ categoryId: undefined })],
    ["sans nom", makeUpdated({ name: undefined })],
    ["sans clé de pochette", makeUpdated({ imageKey: undefined })],
    ["avec des tags qui ne sont pas une liste", makeUpdated({ tags: "IRL" })],
  ])("refuse un changement %s", (_name, updated) => {
    expect(events.channel.channelCategoryUpdated.payload.safeParse(updated).success).toBe(false);
  });

  it("lit un changement publié avant les tags comme une catégorie sans tag (ADR 0050 §3)", () => {
    expect(
      events.channel.channelCategoryUpdated.payload.parse(makeUpdated({ tags: undefined })),
    ).toMatchObject({ tags: [] });
  });
});

describe("channel.category.retired", () => {
  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryRetired).toMatchObject({
      name: "channel.category.retired",
      version: 1,
    });
  });

  it("décode la catégorie retirée", () => {
    expect(
      events.channel.channelCategoryRetired.payload.parse({ categoryId: CATEGORY_ID }),
    ).toEqual({ categoryId: CATEGORY_ID });
  });

  it.each([
    ["sans catégorie", {}],
    ["avec une catégorie qui n'est pas un UUID", { categoryId: "jeux" }],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCategoryRetired.payload.safeParse(payload).success).toBe(false);
  });
});

const FOLLOWER_ID = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

describe("channel.category.followed", () => {
  const makeFollowed = (overrides: Record<string, unknown> = {}) => ({
    userId: FOLLOWER_ID,
    categoryId: CATEGORY_ID,
    followedAt: "2026-11-04T12:00:00.000Z",
    version: 3,
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryFollowed).toMatchObject({
      name: "channel.category.followed",
      version: 1,
    });
  });

  it("décode le compte, la catégorie, le début du suivi et la version de la paire", () => {
    expect(events.channel.channelCategoryFollowed.payload.parse(makeFollowed())).toEqual(
      makeFollowed(),
    );
  });

  it.each([
    ["sans compte", makeFollowed({ userId: undefined })],
    ["avec un compte qui n'est pas un UUID", makeFollowed({ userId: "viewer" })],
    ["sans catégorie", makeFollowed({ categoryId: undefined })],
    ["avec une catégorie qui n'est pas un UUID", makeFollowed({ categoryId: "jeux" })],
    ["sans début du suivi", makeFollowed({ followedAt: undefined })],
    ["avec un début sans fuseau", makeFollowed({ followedAt: "2026-11-04T12:00:00" })],
    ["sans version", makeFollowed({ version: undefined })],
    ["avec une version nulle", makeFollowed({ version: 0 })],
    ["avec une version fractionnaire", makeFollowed({ version: 1.5 })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCategoryFollowed.payload.safeParse(payload).success).toBe(false);
  });
});

describe("channel.category.unfollowed", () => {
  const makeUnfollowed = (overrides: Record<string, unknown> = {}) => ({
    userId: FOLLOWER_ID,
    categoryId: CATEGORY_ID,
    reason: "unfollowed",
    version: 4,
    ...overrides,
  });

  it("porte son nom et sa version", () => {
    expect(events.channel.channelCategoryUnfollowed).toMatchObject({
      name: "channel.category.unfollowed",
      version: 1,
    });
  });

  it.each(["unfollowed", "category_merged", "category_retired", "raison_future"])(
    "décode la raison %s",
    (reason) => {
      expect(
        events.channel.channelCategoryUnfollowed.payload.parse(makeUnfollowed({ reason })),
      ).toEqual(makeUnfollowed({ reason }));
    },
  );

  it.each([
    ["sans compte", makeUnfollowed({ userId: undefined })],
    ["avec un compte qui n'est pas un UUID", makeUnfollowed({ userId: "viewer" })],
    ["sans catégorie", makeUnfollowed({ categoryId: undefined })],
    ["avec une catégorie qui n'est pas un UUID", makeUnfollowed({ categoryId: "jeux" })],
    ["sans raison", makeUnfollowed({ reason: undefined })],
    ["sans version", makeUnfollowed({ version: undefined })],
    ["avec une version nulle", makeUnfollowed({ version: 0 })],
    ["avec une version fractionnaire", makeUnfollowed({ version: 1.5 })],
  ])("refuse un event %s", (_name, payload) => {
    expect(events.channel.channelCategoryUnfollowed.payload.safeParse(payload).success).toBe(false);
  });
});

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
