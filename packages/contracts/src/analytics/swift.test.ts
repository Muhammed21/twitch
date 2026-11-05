import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatSwiftAnalytics, type EventDefinition } from "./index.ts";

const makeEvent = (
  properties: z.ZodObject,
  source: EventDefinition["source"] = "client",
): EventDefinition => ({ source, properties });

const swiftOf = (events: Readonly<Record<string, EventDefinition>>): string =>
  formatSwiftAnalytics({ events, forbiddenKeys: ["email", "ip"] });

describe("formatSwiftAnalytics", () => {
  it("génère le nom, les payloads typés et les clés PII interdites", () => {
    expect(
      swiftOf({
        "account:signed_in": makeEvent(z.strictObject({})),
        "category:followed": makeEvent(
          z.strictObject({
            category_id: z.string(),
            source: z.enum(["onboarding", "category_page"]),
          }),
        ),
        "onboarding:step_completed": makeEvent(
          z.strictObject({ step: z.string(), duration_ms: z.int(), is_skippable: z.boolean() }),
        ),
      }),
    ).toBe(`public enum AnalyticsValue: Equatable, Sendable {
  case string(String)
  case int(Int)
  case bool(Bool)
}

public enum AnalyticsEventName: String, CaseIterable, Sendable {
  case accountSignedIn = "account:signed_in"
  case categoryFollowed = "category:followed"
  case onboardingStepCompleted = "onboarding:step_completed"
}

public enum AnalyticsSource: String, CaseIterable, Sendable {
  case onboarding
  case categoryPage = "category_page"
}

public struct AnalyticsEvent: Equatable, Sendable {
  public static let forbiddenPropertyKeys: Set<String> = ["email", "ip"]

  public static let accountSignedIn = AnalyticsEvent(name: .accountSignedIn, properties: [:])

  public let name: AnalyticsEventName
  public let properties: [String: AnalyticsValue]

  private init(name: AnalyticsEventName, properties: [String: AnalyticsValue]) {
    self.name = name
    self.properties = properties
  }

  public static func categoryFollowed(categoryID: String, source: AnalyticsSource) -> AnalyticsEvent {
    AnalyticsEvent(name: .categoryFollowed, properties: ["category_id": .string(categoryID), "source": .string(source.rawValue)])
  }

  public static func onboardingStepCompleted(step: String, durationMs: Int, isSkippable: Bool) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStepCompleted, properties: ["step": .string(step), "duration_ms": .int(durationMs), "is_skippable": .bool(isSkippable)])
  }
}
`);
  });

  it("génère une seule énumération pour une propriété partagée par plusieurs événements", () => {
    const step = z.enum(["intro", "summary"]);
    const swift = swiftOf({
      "onboarding:step_completed": makeEvent(z.strictObject({ step })),
      "onboarding:step_skipped": makeEvent(z.strictObject({ step })),
    });

    expect(swift.match(/public enum AnalyticsStep: String, CaseIterable, Sendable/g)).toHaveLength(
      1,
    );
    expect(swift).toContain("public static func onboardingStepSkipped(step: AnalyticsStep)");
  });

  it("nomme l'énumération d'une propriété en plusieurs mots d'après tous ses mots", () => {
    expect(
      swiftOf({
        "stream:viewed": makeEvent(z.strictObject({ entry_point: z.enum(["home", "search"]) })),
      }),
    ).toContain("public static func streamViewed(entryPoint: AnalyticsEntryPoint)");
  });

  it("génère une énumération par propriété énumérée distincte", () => {
    const swift = swiftOf({
      "onboarding:step_skipped": makeEvent(z.strictObject({ step: z.enum(["intro"]) })),
      "preference:changed": makeEvent(z.strictObject({ source: z.enum(["settings"]) })),
    });

    expect(swift).toContain("public enum AnalyticsStep: String, CaseIterable, Sendable {");
    expect(swift).toContain("public enum AnalyticsSource: String, CaseIterable, Sendable {");
  });

  it("ne génère que les événements émis par le client", () => {
    const swift = swiftOf({
      "account:signed_in": makeEvent(z.strictObject({})),
      "subscription:started": makeEvent(z.strictObject({ channel_id: z.string() }), "server"),
    });

    expect(swift).toContain('case accountSignedIn = "account:signed_in"');
    expect(swift).not.toContain("subscription");
  });

  it("refuse de générer une taxonomie qui viole les conventions, en listant chaque violation", () => {
    expect(() =>
      swiftOf({
        "account:signed_in": makeEvent(z.strictObject({ email: z.string(), phone: z.string() })),
      }),
    ).toThrow(
      "account:signed_in.email : clé PII interdite\naccount:signed_in.phone : clé PII interdite",
    );
  });

  it("écrit un identifiant en ID, comme le reste de l'app", () => {
    expect(
      swiftOf({
        "stream:viewed": makeEvent(
          z.strictObject({ channel_id: z.string(), video_id_hint: z.string() }),
        ),
      }),
    ).toContain("public static func streamViewed(channelID: String, videoIDHint: String)");
  });

  it("ne laisse pas de ligne vide en trop quand aucun événement n'est sans propriété", () => {
    expect(
      swiftOf({ "stream:viewed": makeEvent(z.strictObject({ channel_id: z.string() })) }),
    ).toContain(
      '  public static let forbiddenPropertyKeys: Set<String> = ["email", "ip"]\n\n  public let name: AnalyticsEventName\n',
    );
  });
});
