import { connect } from "node:net";

import { describe, expect, it, onTestFinished } from "vitest";

import { Problem } from "@repo/video-contract";

import { startHttpServer } from "./http-server.ts";

const startServer = async () => {
  const server = await startHttpServer({ port: 0 });
  onTestFinished(() => server.close());
  return { ...server, url: (path: string) => `http://127.0.0.1:${server.port}${path}` };
};

describe("sondes de santé", () => {
  it("/health/live répond 200 tant que le process tourne", async () => {
    const server = await startServer();

    const response = await fetch(server.url("/health/live"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("/health/ready répond 200 quand le service accepte du travail", async () => {
    const server = await startServer();

    const response = await fetch(server.url("/health/ready"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("/health/ready répond 503 en RFC 9457 dès que l'arrêt commence", async () => {
    const server = await startServer();

    server.startDraining();
    const response = await fetch(server.url("/health/ready"));

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(Problem.parse(await response.json())).toEqual({
      type: "about:blank",
      title: "Service indisponible",
      status: 503,
    });
  });

  it.each([
    ["/health/live?probe=1", { status: "ok" }],
    ["/health/ready?probe=1", { status: "ready" }],
  ])("%s répond comme sans paramètre de requête", async (path, body) => {
    const server = await startServer();

    const response = await fetch(server.url(path));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });

  it("/health/live répond toujours 200 pendant l'arrêt", async () => {
    const server = await startServer();

    server.startDraining();
    const response = await fetch(server.url("/health/live"));

    expect(response.status).toBe(200);
  });
});

describe("routes inconnues", () => {
  it.each([
    ["GET", "/inconnu"],
    ["GET", "/health"],
    ["GET", "/health?x=1"],
    ["POST", "/health/live"],
    ["POST", "/health/ready"],
  ])("%s %s répond 404 en RFC 9457", async (method, path) => {
    const server = await startServer();

    const response = await fetch(server.url(path), { method });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(Problem.parse(await response.json())).toEqual({
      type: "about:blank",
      title: "Ressource introuvable",
      status: 404,
    });
  });
});

const sendRaw = (port: number, request: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1", () => socket.end(request));
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("error", reject);
  });

describe("cible de requête invalide", () => {
  it.each(["http://[", "http://a:99999/"])(
    "GET %s répond 400 en RFC 9457, et le serveur continue de répondre",
    async (target) => {
      const server = await startServer();

      const raw = await sendRaw(
        server.port,
        `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
      );
      const live = await fetch(server.url("/health/live"));

      expect(raw).toMatch(/^HTTP\/1\.1 400 /);
      expect(raw).toContain("content-type: application/problem+json");
      expect(
        Problem.parse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1))),
      ).toEqual({
        type: "about:blank",
        title: "Requête invalide",
        status: 400,
      });
      expect(live.status).toBe(200);
    },
  );
});

describe("démarrage", () => {
  it("échoue si le port est déjà pris", async () => {
    const server = await startServer();

    await expect(startHttpServer({ port: server.port })).rejects.toThrow("EADDRINUSE");
  });
});

describe("arrêt", () => {
  it("ferme le port, même après une requête en keep-alive", async () => {
    const server = await startHttpServer({ port: 0 });
    const url = `http://127.0.0.1:${server.port}/health/live`;
    await fetch(url);

    await server.close();

    await expect(fetch(url)).rejects.toThrow("fetch failed");
  });
});
