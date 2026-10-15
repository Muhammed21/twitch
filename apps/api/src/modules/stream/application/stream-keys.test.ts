import { describe, expect, it } from "vitest";

import { inMemoryAuthzContext, type RoleAssignment } from "@repo/authorization";

import type { StreamCredentials } from "./live-video-provider.ts";
import {
  getStreamKey,
  provisionStreamChannel,
  rotateStreamKey,
  type StreamChannels,
} from "./stream-keys.ts";

const NOW = new Date("2026-10-15T12:00:00.000Z");
const CHANNEL_ID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69";
const OWNER = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const EDITOR = "5a3b0d2f-8c4e-4f9b-a021-3d6e7f8a9b0c";

const CREDENTIALS: StreamCredentials = {
  streamKey: "sk_live_secret",
  ingestUrl: "rtmp://127.0.0.1:1935/live",
};

const roleOn = (role: "owner" | "editor" | "banned"): RoleAssignment => ({
  role,
  scope: { type: "channel", channelId: CHANNEL_ID },
  expiresAt: null,
  revokedAt: null,
});

const memoryChannels = (links: Readonly<Record<string, string>> = {}) => {
  const saved: { channelId: string; providerChannelId: string }[] = [];
  const channels: StreamChannels = {
    providerChannelOf: async (channelId) =>
      links[channelId] ??
      saved.find((link) => link.channelId === channelId)?.providerChannelId ??
      null,
    save: async (link) => {
      saved.push(link);
    },
  };
  return { saved, channels };
};

const recordingProvider = (credentials: StreamCredentials | null = CREDENTIALS) => {
  const provisioned: string[] = [];
  const asked: string[] = [];
  return {
    provisioned,
    asked,
    provider: {
      provisionChannel: async ({ channelId }: { channelId: string }) => {
        provisioned.push(channelId);
        return { providerChannelId: `provider-${channelId}` };
      },
      getStreamKey: async ({ providerChannelId }: { providerChannelId: string }) => {
        asked.push(providerChannelId);
        return credentials;
      },
    },
  };
};

const authz = (assignments: Readonly<Record<string, readonly RoleAssignment[]>>) =>
  inMemoryAuthzContext({ assignments, now: () => NOW });

describe("provisionnement du canal provider d'une chaîne", () => {
  it("crée le canal chez le provider et garde le lien", async () => {
    const { saved, channels } = memoryChannels();
    const { provisioned, provider } = recordingProvider();

    await provisionStreamChannel({ provider, channels })({ channelId: CHANNEL_ID });

    expect(provisioned).toEqual([CHANNEL_ID]);
    expect(saved).toEqual([{ channelId: CHANNEL_ID, providerChannelId: `provider-${CHANNEL_ID}` }]);
  });

  it("ne rappelle pas le provider pour une chaîne déjà provisionnée", async () => {
    const { saved, channels } = memoryChannels({ [CHANNEL_ID]: "provider-existant" });
    const { provisioned, provider } = recordingProvider();

    await provisionStreamChannel({ provider, channels })({ channelId: CHANNEL_ID });

    expect(provisioned).toEqual([]);
    expect(saved).toEqual([]);
  });
});

describe("lecture de la clé de stream", () => {
  const read = ({
    links = { [CHANNEL_ID]: "provider-1" },
    credentials = CREDENTIALS,
    assignments = { [OWNER]: [roleOn("owner")], [EDITOR]: [roleOn("editor")] },
  }: {
    links?: Readonly<Record<string, string>>;
    credentials?: StreamCredentials | null;
    assignments?: Readonly<Record<string, readonly RoleAssignment[]>>;
  } = {}) => {
    const { asked, provider } = recordingProvider(credentials);
    return {
      asked,
      getKey: getStreamKey({
        channels: memoryChannels(links).channels,
        provider,
        authz: authz(assignments),
      }),
    };
  };

  it("rend la clé au propriétaire, lue chez le provider", async () => {
    const { asked, getKey } = read();

    expect(await getKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: true,
      value: CREDENTIALS,
    });
    expect(asked).toEqual(["provider-1"]);
  });

  it.each([
    ["un editor", EDITOR],
    ["un compte sans rôle", "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d"],
  ])("la refuse à %s, sans interroger le provider", async (_name, actorId) => {
    const { asked, getKey } = read();

    expect(await getKey({ actorId, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(asked).toEqual([]);
  });

  it("la refuse à un propriétaire banni de sa chaîne", async () => {
    const { getKey } = read({ assignments: { [OWNER]: [roleOn("owner"), roleOn("banned")] } });

    expect(await getKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("dit qu'une chaîne pas encore provisionnée n'a pas de clé", async () => {
    const { asked, getKey } = read({ links: {} });

    expect(await getKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "not_provisioned",
    });
    expect(asked).toEqual([]);
  });

  it("dit qu'il n'y a pas de clé quand le provider n'en connaît pas", async () => {
    const { getKey } = read({ credentials: null });

    expect(await getKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "not_provisioned",
    });
  });
});

const rotatingProvider = (known: boolean) => {
  const revoked: string[] = [];
  return {
    revoked,
    provider: {
      revokeStreamKey: async ({ providerChannelId }: { providerChannelId: string }) => {
        revoked.push(providerChannelId);
      },
      getStreamKey: async ({ providerChannelId }: { providerChannelId: string }) =>
        known
          ? { ...CREDENTIALS, streamKey: `sk_live_${providerChannelId}_${revoked.length}` }
          : null,
    },
  };
};

describe("rotation de la clé de stream (ADR 0031)", () => {
  const rotate = ({
    links = { [CHANNEL_ID]: "provider-1" },
    known = true,
    assignments = { [OWNER]: [roleOn("owner")], [EDITOR]: [roleOn("editor")] },
  }: {
    links?: Readonly<Record<string, string>>;
    known?: boolean;
    assignments?: Readonly<Record<string, readonly RoleAssignment[]>>;
  } = {}) => {
    const { revoked, provider } = rotatingProvider(known);
    return {
      revoked,
      rotateKey: rotateStreamKey({
        channels: memoryChannels(links).channels,
        provider,
        authz: authz(assignments),
      }),
    };
  };

  it("révoque la clé chez le provider et rend au propriétaire la nouvelle", async () => {
    const { revoked, rotateKey } = rotate();

    expect(await rotateKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: true,
      value: { ...CREDENTIALS, streamKey: "sk_live_provider-1_1" },
    });
    expect(revoked).toEqual(["provider-1"]);
  });

  it.each([
    ["un editor", EDITOR],
    ["un compte sans rôle", "6b4c1e3a-9d5f-4a0c-b132-4e7f8a9b0c1d"],
  ])("la refuse à %s, sans rien révoquer", async (_name, actorId) => {
    const { revoked, rotateKey } = rotate();

    expect(await rotateKey({ actorId, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(revoked).toEqual([]);
  });

  it("la refuse à un propriétaire banni de sa chaîne, sans rien révoquer", async () => {
    const { revoked, rotateKey } = rotate({
      assignments: { [OWNER]: [roleOn("owner"), roleOn("banned")] },
    });

    expect(await rotateKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(revoked).toEqual([]);
  });

  it("dit qu'une chaîne pas encore provisionnée n'a pas de clé, sans appeler le provider", async () => {
    const { revoked, rotateKey } = rotate({ links: {} });

    expect(await rotateKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "not_provisioned",
    });
    expect(revoked).toEqual([]);
  });

  it("dit qu'il n'y a pas de clé quand le provider ne connaît pas le canal", async () => {
    const { rotateKey } = rotate({ known: false });

    expect(await rotateKey({ actorId: OWNER, channelId: CHANNEL_ID })).toEqual({
      ok: false,
      error: "not_provisioned",
    });
  });
});
