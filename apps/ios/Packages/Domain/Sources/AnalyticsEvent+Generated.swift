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
  case preferenceChanged = "preference:changed"
  case notificationPermissionAnswered = "notification_permission:answered"
  case paywallViewed = "paywall:viewed"
  case paywallDismissed = "paywall:dismissed"
  case purchaseStarted = "purchase:started"
  case purchaseCompleted = "purchase:completed"
  case purchaseCancelled = "purchase:cancelled"
  case purchaseFailed = "purchase:failed"
  case purchaseRestored = "purchase:restored"
}

public enum AnalyticsStep: String, CaseIterable, Sendable {
  case intro
  case categories
  case interests
  case contentPreferences = "content_preferences"
  case liveLanguage = "live_language"
  case appearance
  case videoAutoplay = "video_autoplay"
  case notifications
  case chat
  case summary
}

public enum AnalyticsPreference: String, CaseIterable, Sendable {
  case appearance
  case videoAutoplay = "video_autoplay"
  case chatTextSize = "chat_text_size"
  case chatTimestamps = "chat_timestamps"
  case liveLanguage = "live_language"
  case contentFilters = "content_filters"
  case interests
}

public enum AnalyticsSource: String, CaseIterable, Sendable {
  case onboarding
  case settings
}

public enum AnalyticsPlacement: String, CaseIterable, Sendable {
  case onboarding
  case profile
}

public struct AnalyticsEvent: Equatable, Sendable {
  public static let forbiddenPropertyKeys: Set<String> = ["email", "phone", "name", "address", "ip", "token", "password"]

  public static let accountSignedUp = AnalyticsEvent(name: .accountSignedUp, properties: [:])
  public static let accountSignedIn = AnalyticsEvent(name: .accountSignedIn, properties: [:])
  public static let accountSignedOut = AnalyticsEvent(name: .accountSignedOut, properties: [:])

  public let name: AnalyticsEventName
  public let properties: [String: AnalyticsValue]

  private init(name: AnalyticsEventName, properties: [String: AnalyticsValue]) {
    self.name = name
    self.properties = properties
  }

  public static func onboardingStarted(stepCount: Int) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStarted, properties: ["step_count": .int(stepCount)])
  }

  public static func onboardingStepCompleted(step: AnalyticsStep, stepIndex: Int, durationMs: Int, selectionCount: Int) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStepCompleted, properties: ["step": .string(step.rawValue), "step_index": .int(stepIndex), "duration_ms": .int(durationMs), "selection_count": .int(selectionCount)])
  }

  public static func onboardingStepSkipped(step: AnalyticsStep, stepIndex: Int) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingStepSkipped, properties: ["step": .string(step.rawValue), "step_index": .int(stepIndex)])
  }

  public static func onboardingCompleted(durationMs: Int, skippedStepCount: Int) -> AnalyticsEvent {
    AnalyticsEvent(name: .onboardingCompleted, properties: ["duration_ms": .int(durationMs), "skipped_step_count": .int(skippedStepCount)])
  }

  public static func preferenceChanged(preference: AnalyticsPreference, value: String, source: AnalyticsSource) -> AnalyticsEvent {
    AnalyticsEvent(name: .preferenceChanged, properties: ["preference": .string(preference.rawValue), "value": .string(value), "source": .string(source.rawValue)])
  }

  public static func notificationPermissionAnswered(isGranted: Bool) -> AnalyticsEvent {
    AnalyticsEvent(name: .notificationPermissionAnswered, properties: ["is_granted": .bool(isGranted)])
  }

  public static func paywallViewed(variant: String, offeringID: String, placement: AnalyticsPlacement) -> AnalyticsEvent {
    AnalyticsEvent(name: .paywallViewed, properties: ["variant": .string(variant), "offering_id": .string(offeringID), "placement": .string(placement.rawValue)])
  }

  public static func paywallDismissed(variant: String, placement: AnalyticsPlacement) -> AnalyticsEvent {
    AnalyticsEvent(name: .paywallDismissed, properties: ["variant": .string(variant), "placement": .string(placement.rawValue)])
  }

  public static func purchaseStarted(productID: String, variant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .purchaseStarted, properties: ["product_id": .string(productID), "variant": .string(variant)])
  }

  public static func purchaseCompleted(productID: String, variant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .purchaseCompleted, properties: ["product_id": .string(productID), "variant": .string(variant)])
  }

  public static func purchaseCancelled(productID: String, variant: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .purchaseCancelled, properties: ["product_id": .string(productID), "variant": .string(variant)])
  }

  public static func purchaseFailed(productID: String, variant: String, errorCode: String) -> AnalyticsEvent {
    AnalyticsEvent(name: .purchaseFailed, properties: ["product_id": .string(productID), "variant": .string(variant), "error_code": .string(errorCode)])
  }

  public static func purchaseRestored(hasActiveEntitlement: Bool) -> AnalyticsEvent {
    AnalyticsEvent(name: .purchaseRestored, properties: ["has_active_entitlement": .bool(hasActiveEntitlement)])
  }
}
