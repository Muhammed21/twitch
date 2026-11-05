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

@MainActor
private final class Recorder {
  private(set) var events: [OnboardingFunnelEvent] = []
  private(set) var finishes = 0

  func record(_ event: OnboardingFunnelEvent) {
    events.append(event)
  }

  func finish() {
    finishes += 1
  }
}

@MainActor
private func makeJourney(
  steps: [PersonalizationStep] = [.intro, .contentPreferences, .appearance, .summary],
  clock: Clock = Clock(),
  recorder: Recorder = Recorder()
) -> PersonalizationJourney {
  PersonalizationJourney(
    steps: steps,
    now: { clock.now },
    record: { recorder.record($0) },
    onFinish: { recorder.finish() }
  )
}

@MainActor
@Suite("Parcours de personnalisation : suivant, passer, retour, fin (ADR 0051, §1 et §7)")
struct PersonalizationJourneyTests {
  @Test("les pages suivent l'ordre de l'ADR, numérotées de 1 (intro) à 10 (récap)")
  func stepOrder() {
    #expect(PersonalizationStep.allCases.map(\.rawValue) == [
      "intro", "categories", "interests", "content_preferences", "live_language",
      "appearance", "video_autoplay", "notifications", "chat", "summary",
    ])
    #expect(PersonalizationStep.allCases.map(\.page) == Array(1 ... 10))
  }

  @Test("seules les pages de choix se passent : ni l'intro ni le récap")
  func skippable() {
    #expect(!PersonalizationStep.intro.isSkippable)
    #expect(!PersonalizationStep.summary.isSkippable)
    #expect(PersonalizationStep.allCases.filter(\.isSkippable).count == 8)
  }

  @Test("la première page affichée émet onboarding:started une seule fois, avec le nombre de pages")
  func started() {
    let recorder = Recorder()
    let journey = makeJourney(recorder: recorder)

    journey.start()
    journey.start()

    #expect(recorder.events == [.started(stepCount: 4)])
    #expect(journey.step == .intro)
  }

  @Test("valider une page émet step_completed avec le temps passé dessus et le nombre de choix, puis avance")
  func completes() {
    let clock = Clock()
    let recorder = Recorder()
    let journey = makeJourney(clock: clock, recorder: recorder)
    journey.start()

    clock.advance(seconds: 2.5)
    journey.complete(selectionCount: 0)
    clock.advance(seconds: 1.2)
    journey.complete(selectionCount: 3)

    #expect(recorder.events.dropFirst() == [
      .stepCompleted(step: .intro, stepIndex: 1, durationMs: 2500, selectionCount: 0),
      .stepCompleted(step: .contentPreferences, stepIndex: 4, durationMs: 1200, selectionCount: 3),
    ])
    #expect(journey.step == .appearance)
  }

  @Test("passer une page émet step_skipped et avance")
  func skips() {
    let recorder = Recorder()
    let journey = makeJourney(recorder: recorder)
    journey.start()
    journey.complete(selectionCount: 0)

    journey.skip()

    #expect(recorder.events.last == .stepSkipped(step: .contentPreferences, stepIndex: 4))
    #expect(journey.step == .appearance)
  }

  @Test("on ne passe ni l'intro ni le récap")
  func cannotSkipIntro() {
    let recorder = Recorder()
    let journey = makeJourney(recorder: recorder)
    journey.start()

    journey.skip()

    #expect(journey.step == .intro)
    #expect(recorder.events == [.started(stepCount: 4)])
  }

  @Test("atteindre le récap émet onboarding:completed avec la durée totale et le nombre de pages passées")
  func completedAtSummary() {
    let clock = Clock()
    let recorder = Recorder()
    let journey = makeJourney(clock: clock, recorder: recorder)
    journey.start()

    clock.advance(seconds: 1)
    journey.complete(selectionCount: 0)
    clock.advance(seconds: 2)
    journey.skip()
    clock.advance(seconds: 3)
    journey.complete(selectionCount: 1)

    #expect(journey.step == .summary)
    #expect(recorder.events.last == .completed(durationMs: 6000, skippedStepCount: 1))
  }

  @Test("revenir en arrière n'émet rien, et une page revisitée puis validée compte depuis le retour")
  func back() {
    let clock = Clock()
    let recorder = Recorder()
    let journey = makeJourney(clock: clock, recorder: recorder)
    journey.start()
    journey.complete(selectionCount: 0)
    clock.advance(seconds: 4)

    journey.back()
    #expect(journey.step == .intro)
    #expect(recorder.events.count == 2)

    clock.advance(seconds: 1)
    journey.complete(selectionCount: 0)
    #expect(recorder.events.last == .stepCompleted(step: .intro, stepIndex: 1, durationMs: 1000, selectionCount: 0))
  }

  @Test("pas de retour depuis la première page, ni depuis le récap")
  func backBounds() {
    let journey = makeJourney(steps: [.intro, .summary])
    journey.start()
    journey.back()
    #expect(journey.step == .intro)

    journey.complete(selectionCount: 0)
    #expect(!journey.canGoBack)
    journey.back()
    #expect(journey.step == .summary)
  }

  @Test("une page repassée puis validée n'est plus comptée comme passée")
  func skipThenComplete() {
    let recorder = Recorder()
    let journey = makeJourney(recorder: recorder)
    journey.start()
    journey.complete(selectionCount: 0)
    journey.skip()
    journey.back()
    journey.complete(selectionCount: 2)
    journey.complete(selectionCount: 0)

    #expect(recorder.events.last == .completed(durationMs: 0, skippedStepCount: 0))
  }

  @Test("la progression va de la première page au récap")
  func progress() {
    let journey = makeJourney()
    journey.start()
    #expect(journey.progress == 0.25)

    journey.complete(selectionCount: 0)
    #expect(journey.progress == 0.5)
    journey.skip()
    journey.complete(selectionCount: 0)
    #expect(journey.progress == 1)
  }

  @Test("continuer depuis le récap termine le parcours une seule fois, sans événement de page")
  func finish() {
    let recorder = Recorder()
    let journey = makeJourney(steps: [.intro, .summary], recorder: recorder)
    journey.start()
    journey.complete(selectionCount: 0)
    let eventsAtSummary = recorder.events

    journey.complete(selectionCount: 0)
    journey.complete(selectionCount: 0)

    #expect(recorder.finishes == 1)
    #expect(recorder.events == eventsAtSummary)
  }

  @Test("chaque geste a son rôle de retour : validation, changement de page, succès au récap")
  func feedbacks() {
    let journey = makeJourney(steps: [.intro, .appearance, .videoAutoplay, .summary])
    journey.start()
    #expect(journey.feedback == nil)

    journey.complete(selectionCount: 0)
    let validated = journey.feedback
    journey.skip()
    let skipped = journey.feedback
    journey.back()
    let backed = journey.feedback
    journey.complete(selectionCount: 0)
    journey.complete(selectionCount: 0)
    let summary = journey.feedback
    journey.complete(selectionCount: 0)
    let finished = journey.feedback

    let pulses = [validated, skipped, backed, summary, finished]
    #expect(pulses.map { $0?.role } == [.validation, .pageChange, .pageChange, .success, .validation])
    #expect(Set(pulses.compactMap { $0?.sequence }).count == pulses.count)
  }

  @Test("une page signale un choix ou une erreur par un nouveau retour, même répété")
  func pageSignals() {
    let journey = makeJourney()
    journey.start()

    journey.signal(.selection)
    let first = journey.feedback
    journey.signal(.selection)

    #expect(first?.role == .selection)
    #expect(journey.feedback?.role == .selection)
    #expect(journey.feedback != first)
  }

  @Test("on avance vers l'avant, on revient vers l'arrière : le sens anime la transition")
  func direction() {
    let journey = makeJourney()
    journey.start()
    journey.complete(selectionCount: 0)
    #expect(journey.direction == .forward)

    journey.back()
    #expect(journey.direction == .backward)
  }
}
