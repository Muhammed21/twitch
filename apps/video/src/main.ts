import { once } from "node:events";

import { loadEnv } from "./config/env.ts";
import { startHttpServer } from "./http/http-server.ts";

const log = (msg: string, fields: Readonly<Record<string, unknown>> = {}): void => {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), level: "info", msg, ...fields })}\n`,
  );
};

try {
  const config = loadEnv(process.env);
  const server = await startHttpServer({ port: config.httpPort });
  log("service vidéo démarré", { httpPort: server.port });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  server.startDraining();
  await server.close();
  log("service vidéo arrêté");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
