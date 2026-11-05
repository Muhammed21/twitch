import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AnalyticsEvents,
  FORBIDDEN_PROPERTY_KEYS,
  findTaxonomyViolations,
  SWIFT_RESERVED_WORDS,
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

  it("déclare les événements du compte et ceux du funnel d'onboarding de l'ADR 0051, §7", () => {
    expect(Object.keys(AnalyticsEvents)).toEqual([
      "account:signed_up",
      "account:signed_in",
      "account:signed_out",
      "onboarding:started",
      "onboarding:step_completed",
      "onboarding:step_skipped",
      "onboarding:completed",
      "preference:changed",
      "notification_permission:answered",
      "paywall:viewed",
      "paywall:dismissed",
      "purchase:started",
      "purchase:cancelled",
      "purchase:failed",
      "purchase:restored",
    ]);
  });

  it("n'émet du client aucun fait métier : suivre une catégorie se capture côté serveur (ADR 0012, §3)", () => {
    expect(new Set(Object.values(AnalyticsEvents).map(({ source }) => source))).toEqual(
      new Set(["client"]),
    );
    expect(Object.keys(AnalyticsEvents)).not.toContain("category:followed");
  });

  it("ouvre le parcours avec le nombre de pages", () => {
    const { properties } = AnalyticsEvents["onboarding:started"];

    expect(properties.safeParse({ step_count: 10 }).success).toBe(true);
    expect(properties.safeParse({}).success).toBe(false);
  });

  it("décrit une page validée par son nom, sa position, sa durée et le nombre de choix", () => {
    const { properties } = AnalyticsEvents["onboarding:step_completed"];
    const completed = { step: "categories", step_index: 1, duration_ms: 1200, selection_count: 3 };

    expect(properties.safeParse(completed).success).toBe(true);
    expect(properties.safeParse({ ...completed, duration_ms: 1.5 }).success).toBe(false);
    expect(properties.safeParse({ ...completed, step_index: -1 }).success).toBe(false);
    expect(properties.safeParse({ ...completed, selection_count: -1 }).success).toBe(false);
    expect(properties.safeParse({ ...completed, step: "paywall" }).success).toBe(false);
  });

  it("nomme les dix pages du parcours par une énumération fermée", () => {
    const { properties } = AnalyticsEvents["onboarding:step_skipped"];
    const steps = [
      "intro",
      "categories",
      "interests",
      "content_preferences",
      "live_language",
      "appearance",
      "video_autoplay",
      "notifications",
      "chat",
      "summary",
    ];

    expect(steps.map((step) => properties.safeParse({ step, step_index: 0 }).success)).toEqual(
      steps.map(() => true),
    );
  });

  it("termine le parcours avec sa durée et le nombre de pages passées", () => {
    const { properties } = AnalyticsEvents["onboarding:completed"];

    expect(properties.safeParse({ duration_ms: 90_000, skipped_step_count: 2 }).success).toBe(true);
  });

  it("décrit un réglage changé par une préférence fermée, sa valeur et sa provenance", () => {
    const { properties } = AnalyticsEvents["preference:changed"];
    const changed = { preference: "appearance", value: "dark", source: "onboarding" };

    expect(properties.safeParse(changed).success).toBe(true);
    expect(properties.safeParse({ ...changed, source: "settings" }).success).toBe(true);
    expect(properties.safeParse({ ...changed, source: "push" }).success).toBe(false);
    expect(properties.safeParse({ ...changed, preference: "email" }).success).toBe(false);
  });

  it("décrit la réponse à l'alerte de notifications par un booléen", () => {
    const { properties } = AnalyticsEvents["notification_permission:answered"];

    expect(properties.safeParse({ is_granted: true }).success).toBe(true);
    expect(properties.safeParse({ is_granted: "yes" }).success).toBe(false);
  });

  it("porte la variante sur l'exposition au paywall et sur chaque achat (ADR 0016)", () => {
    const withVariant = [
      AnalyticsEvents["paywall:viewed"].properties.safeParse({
        variant: "control",
        offering_id: "turbo",
        placement: "onboarding",
      }),
      AnalyticsEvents["paywall:dismissed"].properties.safeParse({
        variant: "control",
        placement: "onboarding",
      }),
      AnalyticsEvents["purchase:started"].properties.safeParse({
        product_id: "turbo_monthly",
        variant: "control",
      }),
      AnalyticsEvents["purchase:cancelled"].properties.safeParse({
        product_id: "turbo_monthly",
        variant: "control",
      }),
      AnalyticsEvents["purchase:failed"].properties.safeParse({
        product_id: "turbo_monthly",
        variant: "control",
        error_code: "network",
      }),
    ];

    expect(withVariant.map(({ success }) => success)).toEqual([true, true, true, true, true]);
    expect(
      AnalyticsEvents["paywall:viewed"].properties.safeParse({
        offering_id: "turbo",
        placement: "onboarding",
      }).success,
    ).toBe(false);
  });

  it("place le paywall dans l'onboarding seulement, pour la tranche 1", () => {
    expect(
      AnalyticsEvents["paywall:dismissed"].properties.safeParse({
        variant: "control",
        placement: "settings",
      }).success,
    ).toBe(false);
  });

  it("termine une restauration par l'état du droit", () => {
    expect(
      AnalyticsEvents["purchase:restored"].properties.safeParse({ has_active_entitlement: false })
        .success,
    ).toBe(true);
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

  it.each(["default", "in", "self", "true", "case", "repeat"])(
    "refuse la propriété %s, mot réservé en Swift",
    (key) => {
      expect(
        violationsOf({ "stream:viewed": makeClientEvent(z.strictObject({ [key]: z.string() })) }),
      ).toEqual([`stream:viewed.${key} : mot réservé en Swift`]);
    },
  );

  it.each([...SWIFT_RESERVED_WORDS])("refuse le mot réservé Swift %s comme propriété", (key) => {
    expect(
      violationsOf({ "stream:viewed": makeClientEvent(z.strictObject({ [key]: z.string() })) }),
    ).toEqual([`stream:viewed.${key} : mot réservé en Swift`]);
  });

  it("refuse une valeur d'énumération qui est un mot réservé en Swift", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({ entry_point: z.enum(["home", "default"]) }),
        ),
      }),
    ).toEqual(["stream:viewed.entry_point : valeur default, mot réservé en Swift"]);
  });

  it("refuse deux événements qui donnent le même identifiant Swift", () => {
    expect(
      violationsOf({
        "stream:viewed_live": makeClientEvent(z.strictObject({})),
        "stream_viewed:live": makeClientEvent(z.strictObject({})),
      }),
    ).toEqual([
      "stream_viewed:live : même identifiant Swift streamViewedLive que stream:viewed_live",
    ]);
  });

  it("refuse une propriété énumérée dont les valeurs changent d'un événement à l'autre", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({ entry_point: z.enum(["home", "search"]) }),
        ),
        "stream:exited": makeClientEvent(z.strictObject({ entry_point: z.enum(["home"]) })),
      }),
    ).toEqual(["stream:exited.entry_point : valeurs différentes de stream:viewed.entry_point"]);
  });

  it("compare chaque occurrence à la première seulement", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(z.strictObject({ entry_point: z.enum(["home"]) })),
        "stream:exited": makeClientEvent(z.strictObject({ entry_point: z.enum(["search"]) })),
        "stream:paused": makeClientEvent(z.strictObject({ entry_point: z.enum(["category"]) })),
      }),
    ).toEqual([
      "stream:exited.entry_point : valeurs différentes de stream:viewed.entry_point",
      "stream:paused.entry_point : valeurs différentes de stream:viewed.entry_point",
    ]);
  });

  it("compare les valeurs d'une énumération partagée une à une, pas leur concaténation", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(z.strictObject({ entry_point: z.enum(["ab", "c"]) })),
        "stream:exited": makeClientEvent(z.strictObject({ entry_point: z.enum(["a", "bc"]) })),
      }),
    ).toEqual(["stream:exited.entry_point : valeurs différentes de stream:viewed.entry_point"]);
  });

  it("accepte une propriété énumérée partagée avec les mêmes valeurs", () => {
    expect(
      violationsOf({
        "stream:viewed": makeClientEvent(
          z.strictObject({ entry_point: z.enum(["home", "search"]) }),
        ),
        "stream:exited": makeClientEvent(
          z.strictObject({ entry_point: z.enum(["home", "search"]) }),
        ),
      }),
    ).toEqual([]);
  });

  it("refuse un objet de propriétés qui accepte des clés inconnues", () => {
    expect(
      violationsOf({ "stream:viewed": makeClientEvent(z.looseObject({ channel_id: z.string() })) }),
    ).toEqual(["stream:viewed : propriétés ouvertes, attendu z.strictObject"]);
  });
});
