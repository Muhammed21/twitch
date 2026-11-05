import Foundation
import Observation

public enum PersonalizationStep: String, CaseIterable, Sendable {
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

  public var page: Int {
    (Self.allCases.firstIndex(of: self) ?? 0) + 1
  }

  public var isSkippable: Bool {
    self != .intro && self != .summary
  }
}

public enum OnboardingFunnelEvent: Equatable, Sendable {
  case started(stepCount: Int)
  case stepCompleted(step: PersonalizationStep, stepIndex: Int, durationMs: Int, selectionCount: Int)
  case stepSkipped(step: PersonalizationStep, stepIndex: Int)
  case completed(durationMs: Int, skippedStepCount: Int)
}

public enum JourneyFeedback: Equatable, Sendable {
  case selection
  case validation
  case success
  case pageChange
  case error
}

public struct JourneyPulse: Equatable, Sendable {
  public let role: JourneyFeedback
  public let sequence: Int
}

public enum JourneyDirection: Equatable, Sendable {
  case forward
  case backward
}

@MainActor
@Observable
public final class PersonalizationJourney {
  public private(set) var index = 0
  public private(set) var direction = JourneyDirection.forward
  public private(set) var feedback: JourneyPulse?

  public let steps: [PersonalizationStep]

  private var startedAt: Date?
  private var stepStartedAt: Date?
  private var skipped: Set<PersonalizationStep> = []
  private var isFinished = false
  private let now: @MainActor () -> Date
  private let record: @MainActor (OnboardingFunnelEvent) -> Void
  private let onFinish: @MainActor () -> Void

  public init(
    steps: [PersonalizationStep],
    now: @escaping @MainActor () -> Date,
    record: @escaping @MainActor (OnboardingFunnelEvent) -> Void,
    onFinish: @escaping @MainActor () -> Void
  ) {
    self.steps = steps
    self.now = now
    self.record = record
    self.onFinish = onFinish
  }

  public var step: PersonalizationStep {
    steps[index]
  }

  public var progress: Double {
    Double(index + 1) / Double(steps.count)
  }

  public var canGoBack: Bool {
    index > 0 && step != .summary
  }

  public func start() {
    guard startedAt == nil else { return }
    let instant = now()
    startedAt = instant
    stepStartedAt = instant
    record(.started(stepCount: steps.count))
  }

  public func complete(selectionCount: Int) {
    guard step != .summary else {
      finish()
      return
    }
    record(.stepCompleted(step: step, stepIndex: step.page, durationMs: elapsedOnStep, selectionCount: selectionCount))
    skipped.remove(step)
    pulse(.validation)
    advance()
  }

  public func skip() {
    guard step.isSkippable else { return }
    record(.stepSkipped(step: step, stepIndex: step.page))
    skipped.insert(step)
    pulse(.pageChange)
    advance()
  }

  public func back() {
    guard canGoBack else { return }
    direction = .backward
    index -= 1
    stepStartedAt = now()
    pulse(.pageChange)
  }

  public func signal(_ role: JourneyFeedback) {
    pulse(role)
  }

  private var elapsedOnStep: Int {
    milliseconds(since: stepStartedAt)
  }

  private func milliseconds(since start: Date?) -> Int {
    let instant = now()
    return Int((instant.timeIntervalSince(start ?? instant) * 1000).rounded())
  }

  private func pulse(_ role: JourneyFeedback) {
    feedback = JourneyPulse(role: role, sequence: (feedback?.sequence ?? 0) + 1)
  }

  private func advance() {
    direction = .forward
    index = min(index + 1, steps.count - 1)
    stepStartedAt = now()
    guard step == .summary else { return }
    record(.completed(durationMs: milliseconds(since: startedAt), skippedStepCount: skipped.count))
    pulse(.success)
  }

  private func finish() {
    guard !isFinished else { return }
    isFinished = true
    pulse(.validation)
    onFinish()
  }
}
