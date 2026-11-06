import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment";

const valid = {
  PAYLOAD_DATABASE_URL: "postgresql://payload:secret@postgres:5432/payload",
  PAYLOAD_SECRET: "un-secret-de-trente-deux-caracteres-au-moins",
};

describe("l'environnement de Payload, validé au démarrage (ADR 0028 §8)", () => {
  it("accepte une configuration complète", () => {
    expect(parseEnvironment(valid)).toEqual(valid);
  });

  it.each(["PAYLOAD_DATABASE_URL", "PAYLOAD_SECRET"])("refuse l'absence de %s", (name) => {
    expect(() => parseEnvironment({ ...valid, [name]: undefined })).toThrow(name);
  });

  it("refuse une URL qui n'est pas PostgreSQL", () => {
    expect(() =>
      parseEnvironment({ ...valid, PAYLOAD_DATABASE_URL: "mysql://payload@db/payload" }),
    ).toThrow("PAYLOAD_DATABASE_URL");
  });

  it("refuse un secret de moins de 32 caractères", () => {
    expect(() => parseEnvironment({ ...valid, PAYLOAD_SECRET: "court" })).toThrow("PAYLOAD_SECRET");
  });
});
