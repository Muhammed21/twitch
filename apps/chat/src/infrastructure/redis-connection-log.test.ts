import { describe, expect, it } from "vitest";

import { redisConnectionLog } from "./redis-connection-log.ts";

const record = () => {
  const entries: Readonly<Record<string, unknown>>[] = [];
  const connection = redisConnectionLog((entry) => {
    entries.push(entry);
  });
  return { entries, connection };
};

describe("journal de la connexion Redis", () => {
  it("journalise la première erreur d'une panne, pas les tentatives de reconnexion suivantes", () => {
    const { entries, connection } = record();

    connection.onError(new Error("ECONNREFUSED"));
    connection.onError(new Error("ECONNREFUSED"));
    connection.onError(new Error("ECONNREFUSED"));

    expect(entries).toEqual([
      { level: "error", msg: "redis injoignable", error: "Error: ECONNREFUSED" },
    ]);
  });

  it("journalise le retour de Redis après une panne, puis la panne suivante", () => {
    const { entries, connection } = record();
    connection.onError(new Error("ECONNREFUSED"));

    connection.onReady();
    connection.onError(new Error("ECONNRESET"));

    expect(entries).toEqual([
      { level: "error", msg: "redis injoignable", error: "Error: ECONNREFUSED" },
      { level: "info", msg: "redis rétabli" },
      { level: "error", msg: "redis injoignable", error: "Error: ECONNRESET" },
    ]);
  });

  it("ne journalise pas une première connexion réussie", () => {
    const { entries, connection } = record();

    connection.onReady();

    expect(entries).toEqual([]);
  });
});
