import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";

import { createContextClient } from "@repo/db";

import { loadEnv } from "./config/env.ts";
import { createControlPlane } from "./control-plane/control-plane.ts";
import { startHttpServer } from "./http/http-server.ts";
import { prismaVideoStore } from "./persistence/prisma-video-store.ts";
import { streamKeyCipher } from "./persistence/stream-key-cipher.ts";

const log = (msg: string, fields: Readonly<Record<string, unknown>> = {}): void => {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), level: "info", msg, ...fields })}\n`,
  );
};

try {
  const config = loadEnv(process.env);
  const prisma = createContextClient({ context: "video", env: process.env });
  const server = await startHttpServer({
    port: config.httpPort,
    serviceSecret: config.serviceSecret,
    controlPlane: createControlPlane({
      store: prismaVideoStore({
        prisma,
        cipher: streamKeyCipher({ key: config.streamKeyEncryptionKey }),
      }),
      ingestUrl: config.ingestUrl,
      newId: randomUUID,
      randomBytes,
    }),
  });
  log("service vidéo démarré", { httpPort: server.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  server.startDraining();
  await server.close();
  await prisma.$disconnect();
  log("service vidéo arrêté");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
