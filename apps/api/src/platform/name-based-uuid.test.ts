import { describe, expect, it } from "vitest";

import { nameBasedUuid } from "./name-based-uuid.ts";

const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

describe("UUID dérivé d'un nom (RFC 9562, version 5)", () => {
  it("donne l'UUID du vecteur de test de la RFC", () => {
    expect(nameBasedUuid({ namespace: DNS_NAMESPACE, name: "www.example.com" })).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("donne toujours le même UUID pour le même nom", () => {
    expect(nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-42" })).toBe(
      nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-42" }),
    );
  });

  it("donne des UUID différents pour deux noms différents", () => {
    expect(nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-1" })).not.toBe(
      nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-2" }),
    );
  });

  it("donne des UUID différents pour le même nom dans deux espaces de noms", () => {
    const otherNamespace = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

    expect(nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-1" })).not.toBe(
      nameBasedUuid({ namespace: otherNamespace, name: "session-1" }),
    );
  });

  it("porte la version 5 et la variante RFC", () => {
    expect(nameBasedUuid({ namespace: DNS_NAMESPACE, name: "session-1" })).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
