import { createApp } from "./create-app.ts";

try {
  const { app, config } = await createApp({ env: process.env });
  app.enableShutdownHooks();
  await app.listen(config.port);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
