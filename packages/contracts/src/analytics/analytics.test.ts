import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AnalyticsEvents,
  FORBIDDEN_PROPERTY_KEYS,
  findTaxonomyViolations,
  type EventDefinition,
} from "./index.ts";

const makeClientEvent = (properties: z.ZodObject): EventDefinition => ({
  source: "client",
  properties,
});

const violationsOf = (events: Readonly<Record<string, EventDefinition>>): readonly string[] =>
  findTaxonomyViolations(events);

describe("taxonomie des événements analytics (ADR 0012)", () => {
  it("respecte toutes les conventions de nommage et la politique PII", () => {
    expect(findTaxonomyViolations(AnalyticsEvents)).toEqual([]);
  });

  it("déclare les événements du compte et du futur onboarding", () => {
    expect(Object.keys(AnalyticsEvents)).toEqual([
      "account:signed_up",
      "account:signed_in",
      "account:signed_out",
      "onboarding:started",
      "onboarding:step_completed",
      "onboarding:step_skipped",
      "onboarding:completed",
      "onboarding:abandoned",
      "category:followed",
      "paywall:viewed",
      "paywall:dismissed",
      "paywall:purchase_started",
    ]);
  });

  it("déclare une source unique pour chaque événement, ici le client", () => {
    expect(new Set(Object.values(AnalyticsEvents).map(({ source }) => source))).toEqual(
      new Set(["client"]),
    );
  });

  it("décrit une étape terminée par son nom et sa durée entière en millisecondes", () => {
    const { properties } = AnalyticsEvents["onboarding:step_completed"];

    expect(properties.safeParse({ step: "categories", duration_ms: 1200 }).success).toBe(true);
    expect(properties.safeParse({ step: "categories", duration_ms: 1.5 }).success).toBe(false);
    expect(properties.safeParse({ step: "categories" }).success).toBe(false);
  });

  it("décrit le suivi d'une catégorie par son identifiant et sa provenance", () => {
    const { properties } = AnalyticsEvents["category:followed"];

    expect(properties.safeParse({ category_id: "c-1", source: "onboarding" }).success).toBe(true);
    expect(properties.safeParse({ category_id: "c-1", source: "push" }).success).toBe(false);
  });

  it("porte la variante du paywall sur chaque événement du paywall (ADR 0016)", () => {
    const paywall = [
      AnalyticsEvents["paywall:viewed"],
      AnalyticsEvents["paywall:dismissed"],
      AnalyticsEvents["paywall:purchase_started"],
    ];

    expect(paywall.map(({ properties }) => properties.safeParse({}).success)).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      paywall.map(({ properties }) => properties.safeParse({ paywall_variant: "control" }).success),
    ).toEqual([true, true, true]);
  });

  it("refuse une propriété inconnue", () => {
    expect(
      AnalyticsEvents["account:signed_in"].properties.safeParse({ channel_id: "c-1" }).success,
    ).toBe(false);
  });
});

describe("findTaxonomyViolations", () => {
  it("interdit les clés PII listées par l'ADR 0012", () => {
    expect(FORBIDDEN_PROPERTY_KEYS).toEqual([
      "email",
      "phone",
      "name",
      "address",
      "ip",
      "token",
      "password",
    ]);
  });

  it.each(FORBIDDEN_PROPERTY_KEYS)(
    "refuse la clé PII %s, seule ou dans un mot de la clé",
    (key) => {
      expect(
        violationsOf({
          "account:signed_in": makeClientEvent(z.strictObject({ [key]: z.string() })),
          "account:signed_up": makeClientEvent(z.strictObject({ [`user_${key}`]: z.string() })),
        }),
      ).toEqual([
        `account:signed_in.${key} : clé PII interdite`,
        `account:signed_up.user_${key} : clé PII interdite`,
      ]);
    },
  );

  it("laisse passer une clé qui contient une clé PII sans en être un mot", () => {
    expect(
      violationsOf({ "gift:sent": makeClientEvent(z.strictObject({ recipient_id: z.string() })) }),
    ).toEqual([]);
  });

  it.each([
    "streamViewed",
    "stream_viewed",
    "Stream:viewed",
    "stream:",
    ":viewed",
    "stream:viewed:again",
  ])("refuse le nom d'événement %s hors de la convention objet:action_au_passé", (name) => {
    expect(violationsOf({ [name]: makeClientEvent(z.strictObject({})) })).toEqual([
      `${name} : nom hors de la convention objet:action_au_passé`,
    ]);
  });

  it("accepte un nom d'événement en snake_case des deux côtés", () => {
    expect(violationsOf({ "chat:message_sent": makeClientEvent(z.strictObject({})) })).toEqual([]);
  });

  it.each(["durationMs", "Duration", "duration-ms", "_duration", "duration_"])(
    "refuse la propriété %s hors du snake_case",
    (key) => {
      expect(
        violationsOf({ "stream:exited": makeClientEvent(z.strictObject({ [key]: z.string() })) }),
      ).toEqual([`stream:exited.${key} : propriété hors du snake_case`]);
    },
  );

  it("refuse un booléen sans préfixe is_ ou has_", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({ live: z.boolean(), is_live: z.boolean(), has_chat: z.boolean() }),
        ),
      }),
    ).toEqual(["stream:viewed.live : booléen sans préfixe is_ ou has_"]);
  });

  it("refuse un type que la génération Swift ne sait pas porter", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({
            ratio: z.number(),
            position: z.strictObject({ at_ms: z.int() }),
            tags: z.array(z.string()),
            started_at: z.date(),
            level: z.enum({ low: 1, high: 2 }),
          }),
        ),
      }),
    ).toEqual([
      "stream:viewed.ratio : type non pris en charge (chaîne, entier, booléen ou énumération)",
      "stream:viewed.position : type non pris en charge (chaîne, entier, booléen ou énumération)",
      "stream:viewed.tags : type non pris en charge (chaîne, entier, booléen ou énumération)",
      "stream:viewed.started_at : type non pris en charge (chaîne, entier, booléen ou énumération)",
      "stream:viewed.level : type non pris en charge (chaîne, entier, booléen ou énumération)",
    ]);
  });

  it("refuse une propriété facultative", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(z.strictObject({ channel_id: z.string().optional() })),
      }),
    ).toEqual(["stream:viewed.channel_id : propriété facultative"]);
  });

  it("refuse une valeur d'énumération hors du snake_case", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({ entry_point: z.enum(["home", "deepLink"]) }),
        ),
      }),
    ).toEqual(["stream:viewed.entry_point : valeur deepLink hors du snake_case"]);
  });

  it("refuse un objet de propriétés qui accepte des clés inconnues", () => {
    expect(
      violationsOf({ "stream:viewed": makeClientEvent(z.looseObject({ channel_id: z.string() })) }),
    ).toEqual(["stream:viewed : propriétés ouvertes, attendu z.strictObject"]);
  });
});
