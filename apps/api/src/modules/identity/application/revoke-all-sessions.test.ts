import { describe, expect, it } from "vitest";

import { ACCESS_TOKEN_LIFETIME_SECONDS } from "../domain/token-lifetimes.ts";
import {
  revokeAllSessions,
  type RevokedSessionList,
  type SessionRevocationBroadcast,
  type SessionRevocationStore,
} from "./revoke-all-sessions.ts";

type Call = { readonly port: string; readonly payload: unknown };

const makePorts = ({ sids = ["sid-a", "sid-b"] }: { sids?: readonly string[] } = {}) => {
  const calls: Call[] = [];
  const store: SessionRevocationStore = {
    revokeAll: async (command) => {
      calls.push({ port: "store", payload: command });
      return sids;
    },
  };
  const revokedSessions: RevokedSessionList = {
    add: async (entry) => {
      calls.push({ port: "revokedSessions", payload: entry });
    },
  };
  const broadcast: SessionRevocationBroadcast = {
    publish: async (event) => {
      calls.push({ port: "broadcast", payload: event });
    },
  };
  return { ports: { store, revokedSessions, broadcast }, calls };
};

const COMMAND = {
  userId: "user-1",
  reason: "refresh_token_reuse",
  userAgent: "Twitch/1.0",
} as const;

describe("révocation de toutes les sessions d'un utilisateur (ADR 0005, ADR 0026 §3)", () => {
  it("révoque en base les sessions de l'utilisateur, avec la raison et l'appareil", async () => {
    const { ports, calls } = makePorts();

    await revokeAllSessions(ports)(COMMAND);

    expect(calls[0]).toEqual({ port: "store", payload: COMMAND });
  });

  it("inscrit chaque sid révoqué sur la liste de révocation, pour la durée d'un jeton d'accès", async () => {
    const { ports, calls } = makePorts({ sids: ["sid-a", "sid-b"] });

    await revokeAllSessions(ports)(COMMAND);

    expect(calls).toContainEqual({
      port: "revokedSessions",
      payload: { sids: ["sid-a", "sid-b"], ttlSeconds: ACCESS_TOKEN_LIFETIME_SECONDS },
    });
  });

  it("publie la révocation, pour que le chat ferme les sockets de ces sid", async () => {
    const { ports, calls } = makePorts({ sids: ["sid-a"] });

    await revokeAllSessions(ports)(COMMAND);

    expect(calls).toContainEqual({
      port: "broadcast",
      payload: { userId: "user-1", sids: ["sid-a"] },
    });
  });

  it("écrit en base avant Redis, pour qu'une panne de Redis laisse la révocation durable faite", async () => {
    const { ports, calls } = makePorts();

    await revokeAllSessions(ports)(COMMAND);

    expect(calls.map(({ port }) => port)).toEqual(["store", "revokedSessions", "broadcast"]);
  });

  it("renvoie les sid révoqués", async () => {
    const { ports } = makePorts({ sids: ["sid-a"] });

    expect(await revokeAllSessions(ports)(COMMAND)).toEqual(["sid-a"]);
  });
});
