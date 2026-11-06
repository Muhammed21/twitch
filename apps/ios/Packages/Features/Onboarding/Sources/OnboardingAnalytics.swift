import Domain
import Foundation

public extension PersonalizationJourney {
  convenience init(
    steps: [PersonalizationStep],
    now: @escaping @MainActor () -> Date,
    analytics: any Analytics,
    onFinish: @escaping @MainActor () -> Void
  ) {
    self.init(steps: steps, now: now, record: { analytics.capture($0.analyticsEvent) }, onFinish: onFinish)
  }
}

public extension NotificationChoices {
  convenience init(permission: any NotificationPermission, analytics: any Analytics) {
    self.init(permission: permission) { analytics.capture(.notificationPermissionAnswered(isGranted: $0)) }
  }
}

extension OnboardingFunnelEvent {
  var analyticsEvent: AnalyticsEvent {
    switch self {
    case let .started(stepCount):
      .onboardingStarted(stepCount: stepCount)
    case let .stepCompleted(step, stepIndex, durationMs, selectionCount):
      .onboardingStepCompleted(step: step.analytics, stepIndex: stepIndex, durationMs: durationMs, selectionCount: selectionCount)
    case let .stepSkipped(step, stepIndex):
      .onboardingStepSkipped(step: step.analytics, stepIndex: stepIndex)
    case let .completed(durationMs, skippedStepCount):
      .onboardingCompleted(durationMs: durationMs, skippedStepCount: skippedStepCount)
    }
  }
}

extension PersonalizationStep {
  var analytics: AnalyticsStep {
    switch self {
    case .intro: .intro
    case .categories: .categories
    case .interests: .interests
    case .contentPreferences: .contentPreferences
    case .liveLanguage: .liveLanguage
    case .appearance: .appearance
    case .videoAutoplay: .videoAutoplay
    case .notifications: .notifications
    case .chat: .chat
    case .summary: .summary
    }
  }
}
