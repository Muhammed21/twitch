import { once } from "node:events";

import { Pool } from "pg";

import { errorDetails, stdoutSink, writeLog } from "../platform/logging.ts";
import { createRelayRedis, OUTBOXES, startOutboxRelay } from "./outbox-relay.ts";
import { loadRelayEnv } from "./relay-env.ts";

try {
  const config = loadRelayEnv(process.env);
  const pool = new Pool({ connectionString: config.databaseUrl });
  const redis = createRelayRedis(config.redisUrl);
  redis.on("error", (error: unknown) =>
    writeLog(stdoutSink, { level: "error", msg: "redis indisponible", ...errorDetails(error) }),
  );
  await redis.connect();

  const relay = startOutboxRelay({
    pool,
    redis,
    outboxes: OUTBOXES,
    intervalMs: config.intervalMs,
    onError: ({ outbox, error }) =>
      writeLog(stdoutSink, {
        level: "error",
        msg: "relais de l'outbox en échec",
        outbox: `${outbox.schema}.${outbox.table}`,
        ...errorDetails(error),
      }),
  });
  writeLog(stdoutSink, { level: "info", msg: "relais de l'outbox démarré" });

  await Promise.race([once(process, "SIGTERM"), once(process, "SIGINT")]);
  await relay.stop();
  await redis.close();
  await pool.end();
  writeLog(stdoutSink, { level: "info", msg: "relais de l'outbox arrêté" });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
