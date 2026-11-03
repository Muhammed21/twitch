import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

const UNREACHABLE_REDIS = "redis://127.0.0.1:1";

const freePort = async (): Promise<number> => {
  const probe = createServer().listen(0);
  await once(probe, "listening");
  const address = probe.address();
  probe.close();
  return typeof address === "object" && address !== null ? address.port : 0;
};

const startProcess = (env: Record<string, string>) => {
  const child = spawn(process.execPath, [MAIN], {
    env: { PATH: process.env.PATH ?? "", ...env },
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

describe("process apps/chat", () => {
  it("s'arrête au démarrage en code 1 et nomme la variable invalide", async () => {
    const { child, output } = startProcess({ CHAT_HTTP_PORT: "abc", REDIS_URL: UNREACHABLE_REDIS });

    expect(await exitOf(child)).toBe(1);
    expect(output.stderr).toContain("CHAT_HTTP_PORT");
  });

  it(
    "démarre malgré un Redis injoignable, répond sur /health/live puis s'arrête sur SIGTERM",
    { timeout: 10_000 },
    async () => {
      const port = await freePort();
      const { child, output } = startProcess({
        CHAT_HTTP_PORT: String(port),
        REDIS_URL: UNREACHABLE_REDIS,
      });

      expect(await waitForLive(port)).toBe(200);
      expect(output.stdout).toContain('"msg":"chat démarré"');
      const exited = exitOf(child);
      child.kill("SIGTERM");

      expect(await exited).toBe(0);
    },
  );
});
