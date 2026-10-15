import { describe, expect, it } from "vitest";

import { inMemoryAuthzContext, type RoleAssignment } from "@repo/authorization";

import {
  type ChannelDirectory,
  type ChannelView,
  getChannel,
  type TitleChange,
  updateChannelTitle,
} from "./channel-queries.ts";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const OWNER = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const EDITOR = "5a3b0d2f-8c4e-4f9b-a021-3d6e7f8a9b0c";
const VIEWER = "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d";

const CHANNEL: ChannelView = {
  id: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",
  slug: "streamer_de_test",
  title: "",
  ownerId: OWNER,
};

const roleOn = (role: "owner" | "editor" | "banned", channelId = CHANNEL.id): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId },
  expiresAt: null,
  revokedAt: null,
});

const memoryDirectory = (channels: readonly ChannelView[] = [CHANNEL]) => {
  const changes: TitleChange[] = [];
  const directory: ChannelDirectory = {
    findBySlug: async (slug) => channels.find((channel) => channel.slug === slug) ?? null,
    findById: async (id) => channels.find((channel) => channel.id === id) ?? null,
    updateTitle: async (change) => {
      changes.push(change);
      const channel = channels.find(({ id }) => id === change.channelId) ?? CHANNEL;
      return { ...channel, title: change.title };
    },
  };
  return { changes, directory };
};

const authz = (assignments: Readonly<Record<string, readonly RoleAssignment[]>>) =>
  inMemoryAuthzContext({ assignments, now: () => NOW });

const rename = ({
  directory,
  assignments = { [OWNER]: [roleOn("owner")], [EDITOR]: [roleOn("editor")] },
}: {
  directory: ChannelDirectory;
  assignments?: Readonly<Record<string, readonly RoleAssignment[]>>;
}) =>
  updateChannelTitle({
    directory,
    authz: authz(assignments),
    newId: () => "00000000-0000-4000-8000-000000000001",
    now: () => NOW,
  });

describe("lecture d'une chaîne par son slug", () => {
  it("rend la chaîne", async () => {
    expect(await getChannel(memoryDirectory().directory)(CHANNEL.slug)).toEqual({
      ok: true,
      value: CHANNEL,
    });
  });

  it("dit qu'une chaîne inconnue n'existe pas", async () => {
    expect(await getChannel(memoryDirectory().directory)("inconnue")).toEqual({
      ok: false,
      error: "channel_not_found",
    });
  });
});

describe("changement du titre d'une chaîne", () => {
  it.each([
    ["le propriétaire", OWNER],
    ["un editor", EDITOR],
  ])("est permis à %s, avec l'event channel.metadata.updated", async (_name, actorId) => {
    const { changes, directory } = memoryDirectory();

    const outcome = await rename({ directory })({
      actorId,
      channelId: CHANNEL.id,
      title: "  Speedrun du dimanche ",
    });

    expect(outcome).toEqual({ ok: true, value: { ...CHANNEL, title: "Speedrun du dimanche" } });
    expect(changes).toEqual([
      {
        channelId: CHANNEL.id,
        title: "Speedrun du dimanche",
        outboxEventId: "00000000-0000-4000-8000-000000000001",
        occurredAt: NOW,
      },
    ]);
  });

  it("est refusé à un autre compte, sans rien écrire", async () => {
    const { changes, directory } = memoryDirectory();

    const outcome = await rename({ directory })({
      actorId: VIEWER,
      channelId: CHANNEL.id,
      title: "Pris en otage",
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
    expect(changes).toEqual([]);
  });

  it("est refusé au propriétaire d'une autre chaîne", async () => {
    const { directory } = memoryDirectory();

    const outcome = await rename({
      directory,
      assignments: { [VIEWER]: [roleOn("owner", "7c5d2f4b-0e6a-4b1d-8243-5f8a9b0c1d2e")] },
    })({ actorId: VIEWER, channelId: CHANNEL.id, title: "Pris en otage" });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
  });

  it("est refusé à un editor banni de la chaîne", async () => {
    const { directory } = memoryDirectory();

    const outcome = await rename({
      directory,
      assignments: { [EDITOR]: [roleOn("editor"), roleOn("banned")] },
    })({ actorId: EDITOR, channelId: CHANNEL.id, title: "Pris en otage" });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
  });

  it("dit qu'une chaîne inconnue n'existe pas", async () => {
    const { changes, directory } = memoryDirectory([]);

    const outcome = await rename({ directory })({
      actorId: OWNER,
      channelId: CHANNEL.id,
      title: "Titre",
    });

    expect(outcome).toEqual({ ok: false, error: "channel_not_found" });
    expect(changes).toEqual([]);
  });

  it("refuse un titre trop long au propriétaire, sans rien écrire", async () => {
    const { changes, directory } = memoryDirectory();

    const outcome = await rename({ directory })({
      actorId: OWNER,
      channelId: CHANNEL.id,
      title: "a".repeat(141),
    });

    expect(outcome).toEqual({ ok: false, error: "title_too_long" });
    expect(changes).toEqual([]);
  });

  it("ne révèle pas la règle du titre à un compte sans droit", async () => {
    const { directory } = memoryDirectory();

    const outcome = await rename({ directory })({
      actorId: VIEWER,
      channelId: CHANNEL.id,
      title: "a".repeat(141),
    });

    expect(outcome).toEqual({ ok: false, error: "forbidden" });
  });
});
