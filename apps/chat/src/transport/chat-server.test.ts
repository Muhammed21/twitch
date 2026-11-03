import { once } from "node:events";
import { request } from "node:http";
import { connect as connectTcp, type Socket } from "node:net";
import { setTimeout } from "node:timers/promises";

import { describe, expect, it, onTestFinished } from "vitest";
import { WebSocket } from "ws";

import type { RevokedSessions } from "@repo/auth-verifier";

import { redisRevokedSessions } from "../infrastructure/redis-revoked-sessions.ts";
import { startChatServer } from "./chat-server.ts";
import { makeTokenAuthority } from "./testing/tokens.ts";

const SOCKET_PATH = "/socket.io/?EIO=4&transport=websocket";

const startServer = async (
  revokedSessions?: RevokedSessions,
  { closeAfterTest = true }: { closeAfterTest?: boolean } = {},
) => {
  const authority = await makeTokenAuthority();
  const verifier = authority.verifier(revokedSessions);
  const logs: Readonly<Record<string, unknown>>[] = [];
  const verifiedTokens: string[] = [];
  const server = await startChatServer({
    port: 0,
    verifier: {
      verify: (token) => {
        verifiedTokens.push(token);
        return verifier.verify(token);
      },
    },
    log: (entry) => {
      logs.push(entry);
    },
  });
  if (closeAfterTest) {
    onTestFinished(() => server.close());
  }
  return { server, authority, logs, verifiedTokens };
};

const upgrade = (
  port: number,
  { path = SOCKET_PATH, headers = {} }: { path?: string; headers?: Record<string, string> } = {},
) =>
  new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
    const outgoing = request({
      port,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...headers,
      },
    });
    outgoing.on("upgrade", (response, socket) => {
      socket.destroy();
      resolve({ status: response.statusCode, body: "" });
    });
    outgoing.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () =>
        resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }),
      );
    });
    outgoing.on("error", reject);
    outgoing.end();
  });

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

const connect = async (port: number, token: string) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${SOCKET_PATH}`, {
    headers: bearer(token),
  });
  onTestFinished(() => socket.terminate());
  const [open] = await once(socket, "message");
  return { socket, open: String(open) };
};

const closeOf = async (socket: WebSocket) => {
  const [code] = await once(socket, "close");
  return code;
};

const rawUpgrade = async (port: number, token: string) => {
  const client = connectTcp({ port, host: "127.0.0.1" });
  onTestFinished(() => {
    client.destroy();
  });
  await once(client, "connect");
  client.write(
    [
      `GET ${SOCKET_PATH} HTTP/1.1`,
      "Host: 127.0.0.1",
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      `Authorization: Bearer ${token}`,
      "",
      "",
    ].join("\r\n"),
  );
  return client;
};

const resetConnection = async (client: Socket) => {
  client.resetAndDestroy();
  await once(client, "close");
  await setTimeout(50);
};

const deferred = <T>() => {
  const handlers: { resolve: (value: T) => void } = { resolve: () => {} };
  const promise = new Promise<T>((resolve) => {
    handlers.resolve = resolve;
  });
  return { promise, resolve: (value: T) => handlers.resolve(value) };
};

describe("handshake", () => {
  it("refuse en 401, corps vide, un upgrade sans jeton, sans vérifier ni créer de connexion engine.io", async () => {
    const { server, verifiedTokens } = await startServer();

    expect(await upgrade(server.port)).toEqual({ status: 401, body: "" });
    expect(verifiedTokens).toEqual([]);
    expect(server.connectionCount()).toBe(0);
  });

  it.each([
    ["un jeton invalide", "pas-un-jwt"],
    ["un autre schéma que Bearer", "Basic dXNlcjpwYXNz"],
  ])("refuse en 401 %s", async (_name, authorization) => {
    const { server } = await startServer();

    expect(await upgrade(server.port, { headers: { Authorization: authorization } })).toEqual({
      status: 401,
      body: "",
    });
  });

  it.each([
    ["suivi d'autre chose", (token: string) => `Bearer ${token} suite`],
    ["précédé d'autre chose", (token: string) => `Basic Bearer ${token}`],
  ])("refuse en 401 un jeton valide %s", async (_name, authorization) => {
    const { server, authority } = await startServer();
    const token = await authority.sign();

    expect(
      (await upgrade(server.port, { headers: { Authorization: authorization(token) } })).status,
    ).toBe(401);
  });

  it("accepte le schéma Bearer en minuscules", async () => {
    const { server, authority } = await startServer();
    const token = await authority.sign();

    expect(
      (await upgrade(server.port, { headers: { Authorization: `bearer ${token}` } })).status,
    ).toBe(101);
  });

  it("refuse en 401 un jeton expiré", async () => {
    const { server, authority } = await startServer();
    const token = await authority.sign({ expiresIn: "-1m" });

    expect((await upgrade(server.port, { headers: bearer(token) })).status).toBe(401);
  });

  it("refuse en 403 un jeton dont la session est révoquée", async () => {
    const { server, authority } = await startServer({
      isRevoked: async (sid) => sid === "sid-revoque",
    });
    const token = await authority.sign({ sid: "sid-revoque" });

    expect(await upgrade(server.port, { headers: bearer(token) })).toEqual({
      status: 403,
      body: "",
    });
  });

  it("accepte un jeton valide en WebSocket seul, trames de 4 Ko, ping 30 s et délai 60 s", async () => {
    const { server, authority } = await startServer();
    const { open } = await connect(server.port, await authority.sign());

    expect(JSON.parse(open.slice(1))).toMatchObject({
      upgrades: [],
      pingInterval: 30_000,
      pingTimeout: 60_000,
      maxPayload: 4096,
    });
    expect(server.connectionCount()).toBe(1);
  });

  it("accepte le handshake dans le délai quand Redis ne répond pas", async () => {
    const { server, authority } = await startServer(
      redisRevokedSessions({ exists: () => new Promise<number>(() => {}) }),
    );
    const token = await authority.sign();
    const startedAt = Date.now();

    expect((await upgrade(server.port, { headers: bearer(token) })).status).toBe(101);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("survit à un client qui coupe sa connexion pendant la vérification", async () => {
    const revocation = deferred<boolean>();
    const checking = deferred<void>();
    const { server, authority, logs } = await startServer({
      isRevoked: () => {
        checking.resolve();
        return revocation.promise;
      },
    });
    const client = await rawUpgrade(server.port, await authority.sign());
    await checking.promise;
    await resetConnection(client);
    revocation.resolve(true);
    await setTimeout(50);

    expect((await fetch(`http://127.0.0.1:${server.port}/health/live`)).status).toBe(200);
    expect(logs).toContainEqual(expect.objectContaining({ msg: "handshake interrompu" }));
  });

  it("laisse à engine.io les erreurs d'une connexion acceptée", async () => {
    const { server, authority, logs } = await startServer();
    const client = await rawUpgrade(server.port, await authority.sign());
    await once(client, "data");
    await resetConnection(client);

    expect(logs).toEqual([{ msg: "handshake", status: 101 }]);
  });

  it("refuse en 404 un upgrade hors du chemin socket.io", async () => {
    const { server, authority } = await startServer();
    const token = await authority.sign();

    expect(await upgrade(server.port, { path: "/autre", headers: bearer(token) })).toEqual({
      status: 404,
      body: "",
    });
  });

  it("ne journalise ni l'en-tête Authorization ni le jeton", async () => {
    const { server, authority, logs } = await startServer();
    const token = await authority.sign();
    await upgrade(server.port, { headers: bearer(token) });
    await upgrade(server.port, { headers: { Authorization: "Bearer jeton-secret-invalide" } });

    expect(logs).toEqual([
      { msg: "handshake", status: 101 },
      { msg: "handshake", status: 401 },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/authorization|Bearer|jeton-secret-invalide/i);
    expect(JSON.stringify(logs)).not.toContain(token);
  });
});

describe("trames", () => {
  it("ferme la connexion d'une trame de plus de 4 Ko", async () => {
    const { server, authority } = await startServer();
    const { socket } = await connect(server.port, await authority.sign());
    socket.send(`42${JSON.stringify(["chat:send", { body: "a".repeat(4096) }])}`);

    expect(await closeOf(socket)).toBe(1009);
  });

  it("garde ouverte une connexion qui parle en texte", async () => {
    const { server, authority } = await startServer();
    const { socket } = await connect(server.port, await authority.sign());
    socket.send("40");
    const [reply] = await once(socket, "message");

    expect(String(reply)).toMatch(/^40\{"sid":/);
    expect(server.connectionCount()).toBe(1);
  });

  it("ferme la connexion d'un événement socket.io à pièce jointe binaire", async () => {
    const { server, authority } = await startServer();
    const { socket } = await connect(server.port, await authority.sign());
    socket.send("40");
    await once(socket, "message");
    const closed = closeOf(socket);
    socket.send(`451-${JSON.stringify(["chat:send", { _placeholder: true, num: 0 }])}`);
    socket.send(Buffer.from([1, 2, 3]));

    await closed;
    expect(server.connectionCount()).toBe(0);
  });
});

describe("arrêt", () => {
  it("ferme les connexions ouvertes puis le serveur", async () => {
    const { server, authority } = await startServer(undefined, { closeAfterTest: false });
    const { socket } = await connect(server.port, await authority.sign());
    const closed = closeOf(socket);
    await server.close();

    await closed;
    expect(server.connectionCount()).toBe(0);
  });
});

describe("sondes de santé", () => {
  it.each([
    ["/health/live", { status: "ok" }],
    ["/health/ready", { status: "ready" }],
  ])("répond 200 sur %s", async (path, body) => {
    const { server } = await startServer();
    const response = await fetch(`http://127.0.0.1:${server.port}${path}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual(body);
  });

  it("répond 404 sans corps hors des sondes, sans servir le long-polling", async () => {
    const { server } = await startServer();
    const response = await fetch(
      `http://127.0.0.1:${server.port}/socket.io/?EIO=4&transport=polling`,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});
