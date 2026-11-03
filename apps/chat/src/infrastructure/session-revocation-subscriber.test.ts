import { describe, expect, it } from "vitest";

import { SESSION_REVOKED_CHANNEL } from "@repo/auth-verifier";

import { subscribeToSessionRevocations } from "./session-revocation-subscriber.ts";

const startSubscription = async () => {
  const listeners = new Map<string, (message: string) => void>();
  const revoked: (readonly string[])[] = [];
  const malformed: string[] = [];
  await subscribeToSessionRevocations({
    subscriber: {
      subscribe: async (channel, listener) => {
        listeners.set(channel, listener);
      },
    },
    onRevoked: (sids) => revoked.push(sids),
    onMalformed: (message) => malformed.push(message),
  });
  const publish = (message: string) => listeners.get(SESSION_REVOKED_CHANNEL)?.(message);
  return { listeners, publish, revoked, malformed };
};

describe("abonnement aux révocations de session", () => {
  it("écoute le seul canal de révocation de l'API", async () => {
    const { listeners } = await startSubscription();

    expect([...listeners.keys()]).toEqual([SESSION_REVOKED_CHANNEL]);
  });

  it("transmet les sid de chaque révocation publiée", async () => {
    const { publish, revoked, malformed } = await startSubscription();

    publish(JSON.stringify({ userId: "user-1", sids: ["sid-1", "sid-2"] }));
    publish(JSON.stringify({ userId: "user-2", sids: ["sid-3"] }));

    expect(revoked).toEqual([["sid-1", "sid-2"], ["sid-3"]]);
    expect(malformed).toEqual([]);
  });

  it("signale un message hors contrat sans révoquer", async () => {
    const { publish, revoked, malformed } = await startSubscription();

    publish("pas du JSON");

    expect(revoked).toEqual([]);
    expect(malformed).toEqual(["pas du JSON"]);
  });
});
