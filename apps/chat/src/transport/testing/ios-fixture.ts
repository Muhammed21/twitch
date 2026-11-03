import { randomUUID } from "node:crypto";

import { createMessageSender } from "../../application/message-sender.ts";
import { createRoomRegistry } from "../../application/room-registry.ts";
import { startChatServer } from "../chat-server.ts";
import { SATURATION_LIMITS } from "./saturation.ts";
import { makeTokenAuthority } from "./tokens.ts";

const REVOKED_SESSION = "sid-revoked";
const SESSION_REVOKED_LATER = "sid-revoked-later";
const REVOCATION_PERIOD_MS = 500;

const channelId = randomUUID();
const authority = await makeTokenAuthority();

const server = await startChatServer({
  port: 0,
  verifier: authority.verifier({ isRevoked: async (sid) => sid === REVOKED_SESSION }),
  log: () => {},
  chatters: { displayNameOf: async () => "Viewer iOS", sanctionsOf: async () => [] },
  rooms: createRoomRegistry({
    find: async (id) => (id === channelId ? { channelId, sessionId: null } : undefined),
  }),
  messages: createMessageSender(),
  saturation: SATURATION_LIMITS,
});

const fixture = {
  CHAT_FIXTURE_URL: `http://127.0.0.1:${server.port}`,
  CHAT_FIXTURE_CHANNEL: channelId,
  CHAT_FIXTURE_TOKEN: await authority.sign({ userId: randomUUID() }),
  CHAT_FIXTURE_EXPIRED_TOKEN: await authority.sign({ userId: randomUUID(), expiresIn: "-1m" }),
  CHAT_FIXTURE_REVOKED_TOKEN: await authority.sign({ userId: randomUUID(), sid: REVOKED_SESSION }),
  CHAT_FIXTURE_REVOKED_LATER_TOKEN: await authority.sign({
    userId: randomUUID(),
    sid: SESSION_REVOKED_LATER,
  }),
};

const revocations = setInterval(() => {
  server.revokeSessions([SESSION_REVOKED_LATER]);
}, REVOCATION_PERIOD_MS);

process.stdout.write(
  `${Object.entries(fixture)
    .map(([name, value]) => `${name}=${value}`)
    .join("\n")}\n`,
);

const stop = () => {
  clearInterval(revocations);
  void server.close().finally(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
