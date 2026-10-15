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
