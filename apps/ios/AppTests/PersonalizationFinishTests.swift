import Domain
import Foundation
import Preferences
import Testing
@testable import Twitch

@MainActor
private final class CloseRecorder {
  private(set) var closes = 0

  func close() {
    closes += 1
  }
}

@MainActor
private func makePreferences() -> PreferencesStore {
  PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { _ in })
}

@MainActor
@Suite("Fin du parcours de personnalisation (ADR 0051)")
struct PersonalizationFinishTests {
  @Test("terminer le parcours le marque terminé pour ce compte, puis ferme le parcours")
  func marksAccount() {
    let preferences = makePreferences()
    let recorder = CloseRecorder()
    let account = UUID()

    PersonalizationRoot.finish(account: account, preferences: preferences, close: recorder.close)

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(!preferences.hasCompletedOnboarding(UUID()))
    #expect(recorder.closes == 1)
  }

  @Test("un compte toujours inconnu au récap ne bloque pas l'utilisateur : le parcours se ferme sans rien marquer")
  func unknownAccountStillCloses() {
    let preferences = makePreferences()
    let recorder = CloseRecorder()

    PersonalizationRoot.finish(account: nil, preferences: preferences, close: recorder.close)

    #expect(recorder.closes == 1)
  }
}
