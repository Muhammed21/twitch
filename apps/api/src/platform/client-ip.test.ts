import { describe, expect, it } from "vitest";

import { clientIp } from "./client-ip.ts";

const PROXY = "10.0.0.2";
const CLIENT = "203.0.113.7";
const FORGED = "198.51.100.66";

describe("adresse du client derrière les proxys de confiance (ADR 0042)", () => {
  it("prend l'adresse de la connexion et ignore X-Forwarded-For sans proxy de confiance", () => {
    expect(clientIp({ remoteAddress: CLIENT, forwardedFor: FORGED, trustedProxyCount: 0 })).toBe(
      CLIENT,
    );
  });

  it("prend l'adresse ajoutée par le proxy de confiance, pas celle que le client a forgée", () => {
    expect(
      clientIp({
        remoteAddress: PROXY,
        forwardedFor: `${FORGED}, ${CLIENT}`,
        trustedProxyCount: 1,
      }),
    ).toBe(CLIENT);
  });

  it("remonte autant de sauts que de proxys de confiance", () => {
    expect(
      clientIp({
        remoteAddress: PROXY,
        forwardedFor: `${FORGED},${CLIENT} , 10.0.0.1`,
        trustedProxyCount: 2,
      }),
    ).toBe(CLIENT);
  });

  it("prend l'adresse la plus lointaine quand la chaîne compte moins de sauts que de proxys", () => {
    expect(clientIp({ remoteAddress: PROXY, forwardedFor: CLIENT, trustedProxyCount: 3 })).toBe(
      CLIENT,
    );
  });

  it("prend l'adresse de la connexion quand un proxy de confiance n'envoie pas X-Forwarded-For", () => {
    expect(clientIp({ remoteAddress: PROXY, forwardedFor: undefined, trustedProxyCount: 1 })).toBe(
      PROXY,
    );
  });

  it.each(["pas-une-ip", "203.0.113.7:4321", ""])(
    "prend l'adresse de la connexion quand le saut retenu %j n'est pas une IP",
    (hop) => {
      expect(clientIp({ remoteAddress: PROXY, forwardedFor: hop, trustedProxyCount: 1 })).toBe(
        PROXY,
      );
    },
  );

  it("ramène une IPv4 vue en IPv6 à sa forme IPv4", () => {
    expect(
      clientIp({
        remoteAddress: `::ffff:${CLIENT}`,
        forwardedFor: undefined,
        trustedProxyCount: 0,
      }),
    ).toBe(CLIENT);
    expect(
      clientIp({
        remoteAddress: PROXY,
        forwardedFor: `::FFFF:${CLIENT}`,
        trustedProxyCount: 1,
      }),
    ).toBe(CLIENT);
  });

  it.each(["::abcd:203.0.113.7", "2001:db8::ffff:203.0.113.7", "::ffff:abcd"])(
    "garde telle quelle l'IPv6 %j, qui ne porte pas d'IPv4 sous le préfixe ::ffff:",
    (address) => {
      expect(
        clientIp({ remoteAddress: address, forwardedFor: undefined, trustedProxyCount: 0 }),
      ).toBe(address);
    },
  );

  it("écrit une IPv6 en minuscules", () => {
    expect(
      clientIp({ remoteAddress: "2001:DB8::1", forwardedFor: undefined, trustedProxyCount: 0 }),
    ).toBe("2001:db8::1");
  });

  it("range sous une même adresse inconnue une connexion déjà fermée", () => {
    expect(clientIp({ remoteAddress: undefined, forwardedFor: CLIENT, trustedProxyCount: 0 })).toBe(
      "unknown",
    );
  });
});
