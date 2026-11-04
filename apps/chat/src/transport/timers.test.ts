import { describe, expect, it } from "vitest";

import { createLocalTokenBuckets } from "../application/local-token-buckets.ts";
import { createMessageSender } from "../application/message-sender.ts";
import { createRoomRegistry } from "../application/room-registry.ts";
import { startChatServer } from "./chat-server.ts";
import { LocalAdapter } from "./testing/local-adapter.ts";
import { SATURATION_LIMITS } from "./testing/saturation.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const activeTimers = () =>
  process.getActiveResourcesInfo().filter((resource) => resource === "Timeout").length;

describe("arrêt du chat", () => {
  it("ne laisse aucun minuteur actif", async () => {
    const before = activeTimers();
    const authority = await makeTokenAuthority();
    const server = await startChatServer({
      port: 0,
      verifier: authority.verifier(),
      log: () => undefined,
      chatters: { displayNameOf: async () => "Alice", sanctionsOf: async () => [] },
      rooms: createRoomRegistry({ find: async () => undefined }),
      messages: createMessageSender(createLocalTokenBuckets()),
      saturation: SATURATION_LIMITS,
      adapter: LocalAdapter,
    });

    await server.close();

    expect(activeTimers()).toBe(before);
  });
});
