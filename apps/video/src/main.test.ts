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

const startProcess = (env: Record<string, string>) => {
  const child = spawn(process.execPath, [MAIN], {
    env: { PATH: process.env.PATH ?? "", VIDEO_SERVICE_SECRET: "s".repeat(32), ...env },
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
});
