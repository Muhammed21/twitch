import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const SCRIPT = new URL("../../../../.github/scripts/openapi-breaking.sh", import.meta.url).pathname;

const LIVE_PROPERTIES = { id: { type: "string" }, title: { type: "string" } };

const makeDocument = ({
  liveProperties = LIVE_PROPERTIES,
  required = ["id", "title"],
  withV1Path = true,
  withInternalPath = true,
}: {
  liveProperties?: Record<string, unknown>;
  required?: string[];
  withV1Path?: boolean;
  withInternalPath?: boolean;
} = {}) => ({
  openapi: "3.1.0",
  info: { title: "Twitch API", version: "1" },
  paths: {
    ...(withV1Path && {
      "/v1/lives/{id}": {
        get: {
          operationId: "getLive",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Live" } } },
            },
          },
        },
      },
    }),
    ...(withInternalPath && {
      "/internal/debug": {
        get: {
          operationId: "debug",
          responses: {
            "200": {
              description: "",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
    }),
  },
  components: {
    schemas: {
      Live: { type: "object", properties: liveProperties, required, additionalProperties: {} },
    },
  },
});

const compare = async (revision: ReturnType<typeof makeDocument>) => {
  const directory = await mkdtemp(join(tmpdir(), "openapi-breaking-"));
  const base = join(directory, "base.json");
  const next = join(directory, "revision.json");
  await writeFile(base, JSON.stringify(makeDocument()));
  await writeFile(next, JSON.stringify(revision));
  return promisify(execFile)(SCRIPT, [base, next]).then(
    ({ stdout }) => ({ code: 0, output: stdout }),
    (error: { code?: number; stdout?: string }) => ({
      code: error.code,
      output: error.stdout ?? "",
    }),
  );
};

describe("contrôle de rupture du contrat /v1 (oasdiff)", () => {
  it.each([
    [
      "un champ de réponse retiré",
      makeDocument({ liveProperties: { id: { type: "string" } }, required: ["id"] }),
      "response-required-property-removed",
    ],
    [
      "une route /v1 retirée",
      makeDocument({ withV1Path: false }),
      "api-path-removed-without-deprecation",
    ],
  ])("bloque %s", async (_name, revision, rule) => {
    const { code, output } = await compare(revision);

    expect(code).toBe(1);
    expect(output).toContain(rule);
  });

  it.each([
    [
      "un champ de réponse optionnel ajouté",
      makeDocument({ liveProperties: { ...LIVE_PROPERTIES, viewers: { type: "integer" } } }),
    ],
    ["une route hors /v1 retirée", makeDocument({ withInternalPath: false })],
  ])("laisse passer %s", async (_name, revision) => {
    expect((await compare(revision)).code).toBe(0);
  });
});
