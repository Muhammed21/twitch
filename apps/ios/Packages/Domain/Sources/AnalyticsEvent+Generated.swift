public enum AnalyticsValue: Equatable, Sendable {
  case string(String)
  case int(Int)
  case bool(Bool)
}

public enum AnalyticsEventName: String, CaseIterable, Sendable {
  case accountSignedUp = "account:signed_up"
  case accountSignedIn = "account:signed_in"
  case accountSignedOut = "account:signed_out"
  case onboardingStarted = "onboarding:started"
  case onboardingStepCompleted = "onboarding:step_completed"
  case onboardingStepSkipped = "onboarding:step_skipped"
  case onboardingCompleted = "onboarding:completed"
  case onboardingAbandoned = "onboarding:abandoned"
  case categoryFollowed = "category:followed"
  case paywallViewed = "paywall:viewed"
  case paywallDismissed = "paywall:dismissed"
  case paywallPurchaseStarted = "paywall:purchase_started"
}

public enum CategoryFollowedSource: String, CaseIterable, Sendable {
  case onboarding
  case category
}

public struct AnalyticsEvent: Equatable, Sendable {
  public static let forbiddenPropertyKeys: Set<String> = ["email", "phone", "name", "address", "ip", "token", "password"]

  public static let accountSignedUp = AnalyticsEvent(name: .accountSignedUp, properties: [:])
  public static let accountSignedIn = AnalyticsEvent(name: .accountSignedIn, properties: [:])
  public static let accountSignedOut = AnalyticsEvent(name: .accountSignedOut, properties: [:])
  public static let onboardingStarted = AnalyticsEvent(name: .onboardingStarted, properties: [:])
  public static let onboardingCompleted = AnalyticsEvent(name: .onboardingCompleted, properties: [:])

  public let name: AnalyticsEventName
  public let properties: [String: AnalyticsValue]

  private init(name: AnalyticsEventName, properties: [String: AnalyticsValue]) {
    self.name = name
    self.properties = properties
  }

  public static func onboardingStepCompleted(step: String, durationMs: Int) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStepCompleted, properties: ["step": .string(step), "duration_ms": .int(durationMs)])
  }

  public static func onboardingStepSkipped(step: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStepSkipped, properties: ["step": .string(step)])
  }

  public static func onboardingAbandoned(step: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingAbandoned, properties: ["step": .string(step)])
  }

  public static func categoryFollowed(categoryID: String, source: CategoryFollowedSource) -> AnalyticsEvent {
    AnalyticsEvent(name: .categoryFollowed, properties: ["category_id": .string(categoryID), "source": .string(source.rawValue)])
  }

  public static func paywallViewed(paywallVariant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .paywallViewed, properties: ["paywall_variant": .string(paywallVariant)])
  }

  public static func paywallDismissed(paywallVariant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .paywallDismissed, properties: ["paywall_variant": .string(paywallVariant)])
  }

  public static func paywallPurchaseStarted(paywallVariant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .paywallPurchaseStarted, properties: ["paywall_variant": .string(paywallVariant)])
  }
}
