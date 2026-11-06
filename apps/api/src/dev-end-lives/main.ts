import { randomUUID } from "node:crypto";

import { createContextClient } from "@repo/db";

import { endDanglingLives } from "../modules/stream/application/end-dangling-lives.ts";
import { prismaDanglingLives } from "../modules/stream/infrastructure/prisma-dangling-lives.ts";
import { loadEnv } from "../platform/config/env.ts";
import { isLocalApi } from "../seed-dev/local-host.ts";

if (!isLocalApi(loadEnv(process.env).authBaseUrl)) {
  process.stderr.write(
    "dev:end-lives ne tourne que contre une API locale : BETTER_AUTH_URL doit viser localhost, 127.0.0.1, [::1] ou une adresse privée de ce poste (réseau local).\n",
  );
  process.exit(1);
}

const prisma = createContextClient({ context: "stream", env: process.env });
try {
  const ended = await endDanglingLives({
    lives: prismaDanglingLives(prisma),
    now: () => new Date(),
    newId: randomUUID,
  })();
  process.stdout.write(
    [
      `Lives terminés : ${ended.length}.`,
      ...ended.map(({ sessionId, channelId }) => `- session ${sessionId}, chaîne ${channelId}`),
      "",
    ].join("\n"),
  );
} finally {
  await prisma.$disconnect();
}
