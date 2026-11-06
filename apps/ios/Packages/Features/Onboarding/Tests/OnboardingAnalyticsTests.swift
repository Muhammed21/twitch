import AnalyticsTesting
import Domain
import Foundation
import Onboarding
import Testing

@MainActor
private final class Clock {
  private(set) var now = Date(timeIntervalSince1970: 1000)

  func advance(seconds: TimeInterval) {
    now = now.addingTimeInterval(seconds)
  }
}

private actor AnsweringPermission: NotificationPermission {
  private let answer: Bool?

  init(answer: Bool?) {
    self.answer = answer
  }

  func authorization() async -> NotificationAuthorization {
    .notDetermined
  }

  func request() async -> Bool? {
    answer
  }
}

@MainActor
private func makeJourney(
  steps: [PersonalizationStep] = PersonalizationStep.allCases,
  clock: Clock = Clock(),
  analytics: RecordingAnalytics
) -> PersonalizationJourney {
  PersonalizationJourney(steps: steps, now: { clock.now }, analytics: analytics, onFinish: {})
}

@MainActor
@Suite("Parcours de personnalisation : événements PostHog du funnel (ADR 0051, §7)")
struct OnboardingAnalyticsTests {
  @Test("la première page affichée émet onboarding:started avec les 10 pages du parcours")
  func started() {
    let analytics = RecordingAnalytics()
    let journey = makeJourney(analytics: analytics)

    journey.start()

    #expect(analytics.captured == [.onboardingStarted(stepCount: 10)])
  }

  @Test("une page validée émet onboarding:step_completed avec sa page, sa durée et le nombre de choix")
  func stepCompleted() {
    let analytics = RecordingAnalytics()
    let clock = Clock()
    let journey = makeJourney(clock: clock, analytics: analytics)
    journey.start()
    journey.complete(selectionCount: 0)
    clock.advance(seconds: 2.5)

    journey.complete(selectionCount: 3)

    #expect(analytics.captured.last == .onboardingStepCompleted(step: .categories, stepIndex: 2, durationMs: 2500, selectionCount: 3))
  }

  @Test("une page passée émet onboarding:step_skipped avec sa page")
  func stepSkipped() {
    let analytics = RecordingAnalytics()
    let journey = makeJourney(steps: [.intro, .liveLanguage, .summary], analytics: analytics)
    journey.start()
    journey.complete(selectionCount: 0)

    journey.skip()

    #expect(analytics.captured.contains(.onboardingStepSkipped(step: .liveLanguage, stepIndex: 5)))
  }

  @Test("chaque page porte le nom de la taxonomie", arguments: zip(
    PersonalizationStep.allCases.filter(\.isSkippable),
    [AnalyticsStep.categories, .interests, .contentPreferences, .liveLanguage, .appearance, .videoAutoplay, .notifications, .chat]
  ))
  func stepNames(step: PersonalizationStep, expected: AnalyticsStep) {
    let analytics = RecordingAnalytics()
    let journey = makeJourney(steps: [step, .summary], analytics: analytics)

    journey.skip()

    #expect(analytics.captured.first == .onboardingStepSkipped(step: expected, stepIndex: step.page))
  }

  @Test("l'intro validée porte le nom intro")
  func introName() {
    let analytics = RecordingAnalytics()
    let journey = makeJourney(analytics: analytics)

    journey.complete(selectionCount: 0)

    #expect(analytics.captured == [.onboardingStepCompleted(step: .intro, stepIndex: 1, durationMs: 0, selectionCount: 0)])
  }

  @Test("le récap atteint émet onboarding:completed avec la durée totale et les pages passées")
  func completed() {
    let analytics = RecordingAnalytics()
    let clock = Clock()
    let journey = makeJourney(steps: [.intro, .appearance, .chat, .summary], clock: clock, analytics: analytics)
    journey.start()
    clock.advance(seconds: 1)
    journey.complete(selectionCount: 0)
    clock.advance(seconds: 2)
    journey.skip()
    clock.advance(seconds: 4)

    journey.skip()

    #expect(analytics.captured.last == .onboardingCompleted(durationMs: 7000, skippedStepCount: 2))
  }

  @Test("la réponse à l'alerte système émet notification_permission:answered", arguments: [true, false])
  func notificationAnswered(isGranted: Bool) async {
    let analytics = RecordingAnalytics()
    let choices = NotificationChoices(permission: AnsweringPermission(answer: isGranted), analytics: analytics)

    _ = await choices.turnOn()

    #expect(analytics.captured == [.notificationPermissionAnswered(isGranted: isGranted)])
  }

  @Test("une alerte restée sans réponse n'émet rien")
  func notificationUnanswered() async {
    let analytics = RecordingAnalytics()
    let choices = NotificationChoices(permission: AnsweringPermission(answer: nil), analytics: analytics)

    _ = await choices.turnOn()

    #expect(analytics.captured.isEmpty)
  }
}
