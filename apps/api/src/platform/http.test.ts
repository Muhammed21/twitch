import { connect } from "node:net";

import { Controller, Get, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { configureApp } from "./configure-app.ts";
import { PlatformModule, type SchemaVersionCheck } from "./platform.module.ts";
import { InvalidRequestException, ProblemException } from "./problem.ts";

@Controller("faulty")
class FaultyController {
  @Get("problem")
  problem(): never {
    throw new ProblemException({
      status: 409,
      type: "https://twitch.local/problems/slug-taken",
      title: "Slug déjà pris",
      detail: "Le slug « streamer » appartient à une autre chaîne.",
    });
  }

  @Get("validation")
  validation(): never {
    const parsed = z
      .object({ title: z.string().min(3), tags: z.array(z.string()) })
      .safeParse({ title: "a", tags: [42] });
    throw new InvalidRequestException(parsed.error ?? new z.ZodError([]));
  }

  @Get("internal-parse")
  internalParse(): never {
    z.object({ viewerCount: z.int() }).parse({ viewerCount: "beaucoup" });
    throw new Error("inatteignable");
  }

  @Get("crash")
  crash(): never {
    throw new Error("connexion refusée à 10.0.0.12 avec le mot de passe hunter2");
  }

  @Get("nonstandard")
  nonstandard(): never {
    throw new HttpException("client parti", 499);
  }

  @Get("ok")
  ok() {
    return { status: "ok" };
  }
}

const rawStatusLine = (url: URL, target: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    });
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").split("\r\n")[0] ?? ""));
    socket.on("error", reject);
  });

const ready: SchemaVersionCheck = async () => {};

const behind: SchemaVersionCheck = async () => {
  throw new Error("la migration 20991231000000_a_venir n'est pas appliquée");
};

const startApp = async ({
  schemaVersionCheck = ready,
}: { schemaVersionCheck?: SchemaVersionCheck } = {}) => {
  const lines: string[] = [];
  const moduleRef = await Test.createTestingModule({
    imports: [PlatformModule.register({ schemaVersionCheck, logSink: (line) => lines.push(line) })],
    controllers: [FaultyController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const url = await app.getUrl();
  return {
    request: (path: string, init?: RequestInit) => fetch(`${url}${path}`, init),
    rawStatusLine: (target: string) => rawStatusLine(new URL(url), target),
    logs: () => lines.map((line): unknown => JSON.parse(line)),
    rawLogs: () => lines.join("\n"),
    close: () => app.close(),
  };
};

type App = Awaited<ReturnType<typeof startApp>>;

const withApp = async (
  run: (app: App) => Promise<void>,
  options?: { schemaVersionCheck?: SchemaVersionCheck },
) => {
  const app = await startApp(options);
  try {
    await run(app);
  } finally {
    await app.close();
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("erreurs au format RFC 9457", () => {
  it("traduit une erreur métier en problem+json, avec son statut", async () => {
    await withApp(async ({ request }) => {
      const response = await request("/v1/faulty/problem");

      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toMatch(/^application\/problem\+json/);
      expect(await response.json()).toEqual({
        type: "https://twitch.local/problems/slug-taken",
        title: "Slug déjà pris",
        status: 409,
        detail: "Le slug « streamer » appartient à une autre chaîne.",
        instance: "/v1/faulty/problem",
        correlationId: response.headers.get("x-correlation-id"),
      });
    });
  });

  it("traduit une erreur de validation en 400, avec les chemins fautifs", async () => {
    await withApp(async ({ request, logs }) => {
      const response = await request("/v1/faulty/validation");
      const body = (await response.json()) as { errors: { path: string }[] };

      expect(response.status).toBe(400);
      expect(body).toMatchObject({ type: "about:blank", title: "Requête invalide", status: 400 });
      expect(body.errors.map((error) => error.path)).toEqual(["title", "tags.0"]);
      expect(logs()).not.toContainEqual(expect.objectContaining({ msg: "unhandled" }));
    });
  });

  it("répond 500 sans exposer le message d'une erreur inattendue", async () => {
    await withApp(async ({ request, logs }) => {
      const response = await request("/v1/faulty/crash");
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({
        type: "about:blank",
        title: "Erreur interne",
        status: 500,
      });
      expect(text).not.toContain("hunter2");
      expect(logs()).toContainEqual(
        expect.objectContaining({
          level: "error",
          msg: "unhandled",
          error: "connexion refusée à 10.0.0.12 avec le mot de passe hunter2",
          correlationId: response.headers.get("x-correlation-id"),
        }),
      );
    });
  });

  it("répond 404 en problem+json sur une route inconnue", async () => {
    await withApp(async ({ request }) => {
      const response = await request("/v1/inconnue");

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toMatch(/^application\/problem\+json/);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        status: 404,
        title: "Not Found",
        correlationId: response.headers.get("x-correlation-id"),
      });
      expect(response.headers.get("x-correlation-id")).toMatch(UUID);
    });
  });
});

describe("statuts et journal des erreurs", () => {
  it("traite une erreur de validation interne comme une erreur serveur, journalisée", async () => {
    await withApp(async ({ request, logs }) => {
      const response = await request("/v1/faulty/internal-parse");
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({ title: "Erreur interne", status: 500 });
      expect(text).not.toContain("viewerCount");
      expect(logs()).toContainEqual(expect.objectContaining({ level: "error", msg: "unhandled" }));
    });
  });

  it("donne un titre générique à un statut HTTP sans libellé standard", async () => {
    await withApp(async ({ request }) => {
      const response = await request("/v1/faulty/nonstandard");

      expect(response.status).toBe(499);
      expect(await response.json()).toMatchObject({ title: "Erreur", status: 499 });
    });
  });

  it("ne journalise pas comme inattendue une erreur 5xx voulue", async () => {
    await withApp(
      async ({ request, logs }) => {
        await request("/health/ready");

        expect(logs()).not.toContainEqual(expect.objectContaining({ msg: "unhandled" }));
      },
      { schemaVersionCheck: behind },
    );
  });
});

describe("cibles de requête hostiles", () => {
  it.each(["//x:abc", "//[", "/%zz"])(
    "répond à %j sans tomber, et sert encore la requête suivante",
    async (target) => {
      await withApp(async ({ request, rawStatusLine, logs }) => {
        expect(await rawStatusLine(target)).toMatch(/^HTTP\/1\.1 \d{3} /);
        expect((await request("/health/live")).status).toBe(200);
        expect(logs()).toContainEqual(expect.objectContaining({ msg: "request", path: target }));
      });
    },
  );

  it("journalise le chemin sans ses paramètres", async () => {
    await withApp(async ({ request, logs }) => {
      await request("/v1/faulty/ok?token=secret&page=2");

      expect(logs()).toContainEqual(
        expect.objectContaining({ msg: "request", path: "/v1/faulty/ok" }),
      );
      expect(JSON.stringify(logs())).not.toContain("secret");
    });
  });
});

describe("correlationId", () => {
  it("attribue un identifiant à chaque requête", async () => {
    await withApp(async ({ request }) => {
      const first = await request("/v1/faulty/ok");
      const second = await request("/v1/faulty/ok");

      expect(first.headers.get("x-correlation-id")).toMatch(UUID);
      expect(second.headers.get("x-correlation-id")).not.toBe(
        first.headers.get("x-correlation-id"),
      );
    });
  });

  it("reprend l'identifiant fourni par l'appelant", async () => {
    await withApp(async ({ request }) => {
      const response = await request("/v1/faulty/ok", {
        headers: { "x-correlation-id": "ios-4f2a9c" },
      });

      expect(response.headers.get("x-correlation-id")).toBe("ios-4f2a9c");
    });
  });

  it.each(["a b", "x".repeat(65), "<script>"])(
    "remplace un identifiant fourni mal formé : %j",
    async (provided) => {
      await withApp(async ({ request }) => {
        const response = await request("/v1/faulty/ok", {
          headers: { "x-correlation-id": provided },
        });

        expect(response.headers.get("x-correlation-id")).toMatch(UUID);
      });
    },
  );
});

describe("journal des requêtes", () => {
  it("écrit une ligne JSON par requête, avec méthode, chemin, statut et correlationId", async () => {
    await withApp(async ({ request, logs }) => {
      const response = await request("/v1/faulty/problem");

      expect(logs()).toContainEqual(
        expect.objectContaining({
          msg: "request",
          method: "GET",
          path: "/v1/faulty/problem",
          status: 409,
          level: "info",
          correlationId: response.headers.get("x-correlation-id"),
        }),
      );
      const durations = logs().flatMap((line) =>
        typeof line === "object" && line !== null && "durationMs" in line ? [line.durationMs] : [],
      );
      expect(durations).toHaveLength(1);
      expect(durations[0]).toBeGreaterThanOrEqual(0);
      expect(durations[0]).toBeLessThan(10_000);
    });
  });

  it("n'écrit jamais l'en-tête Authorization ni un cookie", async () => {
    await withApp(async ({ request, rawLogs }) => {
      await request("/v1/faulty/crash?trace=1", {
        headers: {
          authorization: "Bearer eyJhbGciOiJFZERTQSJ9.jeton-secret",
          cookie: "better-auth.session_token=cookie-secret",
        },
      });

      expect(rawLogs()).not.toContain("jeton-secret");
      expect(rawLogs()).not.toContain("cookie-secret");
    });
  });
});

describe("sondes", () => {
  it("répond sur /health/live, hors du préfixe /v1", async () => {
    await withApp(async ({ request }) => {
      const live = await request("/health/live");

      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: "ok" });
      expect((await request("/v1/health/live")).status).toBe(404);
    });
  });

  it("répond prêt quand la version du schéma est la bonne", async () => {
    await withApp(async ({ request }) => {
      const response = await request("/health/ready");

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: "ready" });
    });
  });

  it("répond 503 quand la base est en retard, sans détailler l'erreur", async () => {
    await withApp(
      async ({ request, logs }) => {
        const response = await request("/health/ready");
        const text = await response.text();

        expect(response.status).toBe(503);
        expect(JSON.parse(text)).toMatchObject({
          type: "about:blank",
          title: "Service indisponible",
          status: 503,
        });
        expect(text).not.toContain("20991231000000_a_venir");
        expect(logs()).toContainEqual(
          expect.objectContaining({
            level: "error",
            msg: "not ready",
            error: "la migration 20991231000000_a_venir n'est pas appliquée",
          }),
        );
      },
      { schemaVersionCheck: behind },
    );
  });
});
