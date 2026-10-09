import { createServer, type Server, type Socket } from "node:net";

import { describe, expect, it } from "vitest";

import { assertSchemaVersion } from "../index.ts";

const silentServer = () =>
  new Promise<{ port: number; server: Server; sockets: Set<Socket> }>((resolve) => {
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address !== null ? address.port : 0,
        server,
        sockets,
      });
    });
  });

describe("assertSchemaVersion", () => {
  it("abandonne une base qui accepte la connexion sans jamais répondre", async () => {
    const { port, server, sockets } = await silentServer();
    const startedAt = performance.now();
    try {
      await expect(
        assertSchemaVersion({
          connectionString: `postgresql://app_health:secret@127.0.0.1:${port}/app`,
          migration: "20261009140042_socle",
          connectionTimeoutMillis: 200,
        }),
      ).rejects.toThrow("timeout");
      expect(performance.now() - startedAt).toBeLessThan(2000);
    } finally {
      sockets.forEach((socket) => socket.destroy());
      server.close();
    }
  });
});
