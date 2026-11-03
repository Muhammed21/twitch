import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

const freePort = async (): Promise<number> => {
  const probe = createServer().listen(0);
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  return typeof address === "object" && address !== null ? address.port : 0;
};

const BOOT_ENV = {
  VIDEO_SERVICE_SECRET: "s".repeat(32),
  VIDEO_STREAM_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  DATABASE_URL_VIDEO: "postgresql://app_video:secret@127.0.0.1:1/app",
  VIDEO_WEBHOOK_SECRET: "w".repeat(32),
  DATABASE_URL_OUTBOX_RELAY: "postgresql://app_outbox_relay:secret@127.0.0.1:1/app",
  OUTBOX_RELAY_INTERVAL_MS: "20",
};

const startProcess = (env: Record<string, string>, { without }: { without?: string } = {}) => {
  const bootEnv = Object.fromEntries(Object.entries(BOOT_ENV).filter(([name]) => name !== without));
  const child = spawn(process.execPath, [MAIN], {
    env: { PATH: process.env.PATH ?? "", ...bootEnv, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  onTestFinished(() => {
    child.kill("SIGKILL");
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk: Buffer) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output.stderr += chunk.toString();
  });
  return { child, output };
};

const exitOf = async (child: ChildProcess): Promise<number | null> => {
  const [code] = await once(child, "exit");
  return typeof code === "number" ? code : null;
};

const waitForLive = async (port: number): Promise<number> => {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const status = await fetch(`http://127.0.0.1:${port}/health/live`).then(
      (response) => response.status,
      () => 0,
    );
    if (status !== 0) {
      return status;
    }
    await sleep(50);
  }
  return 0;
};

describe("process apps/video", () => {
  it("s'arrête au démarrage en code 1 et nomme la variable invalide", async () => {
    const { child, output } = startProcess({ VIDEO_HTTP_PORT: "abc" });

    expect(await exitOf(child)).toBe(1);
    expect(output.stderr).toContain("VIDEO_HTTP_PORT");
  });

  it("s'arrête au démarrage en code 1 et nomme DATABASE_URL_VIDEO quand elle manque", async () => {
    const { child, output } = startProcess({}, { without: "DATABASE_URL_VIDEO" });

    expect(await exitOf(child)).toBe(1);
    expect(output.stderr).toContain("DATABASE_URL_VIDEO");
  });

  it(
    "répond sur /health/live puis s'arrête proprement sur SIGTERM",
    { timeout: 10_000 },
    async () => {
      const port = await freePort();
      const { child } = startProcess({ VIDEO_HTTP_PORT: String(port) });

      expect(await waitForLive(port)).toBe(200);
      const exited = exitOf(child);
      child.kill("SIGTERM");

      expect(await exited).toBe(0);
    },
  );

  it(
    "relaie l'outbox en tâche de fond : une base injoignable est journalisée sans arrêter le service",
    { timeout: 10_000 },
    async () => {
      const port = await freePort();
      const { child, output } = startProcess({ VIDEO_HTTP_PORT: String(port) });

      expect(await waitForLive(port)).toBe(200);
      const deadline = Date.now() + 5000;
      while (
        !output.stdout.includes("relais de l'outbox vidéo en échec") &&
        Date.now() < deadline
      ) {
        await sleep(50);
      }

      expect(output.stdout).toContain('"level":"error","msg":"relais de l\'outbox vidéo en échec"');
      expect(await waitForLive(port)).toBe(200);
      const exited = exitOf(child);
      child.kill("SIGTERM");
      expect(await exited).toBe(0);
    },
  );
});
