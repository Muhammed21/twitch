import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { connect, createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it, onTestFinished } from "vitest";

import { makeChunk } from "./rtmp/testing/rtmp-fixtures.ts";

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
  VIDEO_RTMP_PORT: "0",
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

const rtmpPublisher = async (port: number) => {
  const socket = connect(port, "127.0.0.1");
  socket.on("error", () => undefined);
  onTestFinished(() => {
    socket.destroy();
  });
  const closed = new Promise<true>((resolve) => {
    socket.once("close", () => resolve(true));
  });
  await once(socket, "connect");
  const received: Buffer[] = [];
  socket.on("data", (chunk: Buffer) => received.push(chunk));
  socket.write(Uint8Array.of(3, ...new Uint8Array(1536)));
  while (Buffer.concat(received).length < 3073) {
    await sleep(10);
  }
  expect(Buffer.concat(received)[0]).toBe(3);
  socket.write(new Uint8Array(1536));
  return {
    closed,
    announce: (length: number) => {
      socket.write(makeChunk({ fmt: 0, chunkStreamId: 6, length, typeId: 9, streamId: 1 }));
    },
  };
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

  it(
    "sert l'ingest RTMP sur VIDEO_RTMP_PORT, avec des messages plafonnés à 2 Mio",
    { timeout: 10_000 },
    async () => {
      const [httpPort, rtmpPort] = [await freePort(), await freePort()];
      startProcess({ VIDEO_HTTP_PORT: String(httpPort), VIDEO_RTMP_PORT: String(rtmpPort) });
      expect(await waitForLive(httpPort)).toBe(200);
      const atLimit = await rtmpPublisher(rtmpPort);
      const overLimit = await rtmpPublisher(rtmpPort);

      atLimit.announce(2 * 1024 * 1024);
      overLimit.announce(2 * 1024 * 1024 + 1);

      expect(await overLimit.closed).toBe(true);
      expect(await Promise.race([atLimit.closed, sleep(100).then(() => false)])).toBe(false);
    },
  );

  it("s'arrête en code 1 quand le port RTMP est déjà pris", { timeout: 10_000 }, async () => {
    const taken = createServer().listen(0);
    await once(taken, "listening");
    onTestFinished(() => {
      taken.close();
    });
    const address = taken.address();
    const rtmpPort = typeof address === "object" && address !== null ? address.port : 0;

    const { child, output } = startProcess({
      VIDEO_HTTP_PORT: String(await freePort()),
      VIDEO_RTMP_PORT: String(rtmpPort),
    });

    expect(await exitOf(child)).toBe(1);
    expect(output.stderr).toContain("EADDRINUSE");
  });
});
