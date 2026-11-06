@testable import Onboarding
import Testing

@Suite("Parcours au VoiceOver : un échec de chargement est annoncé")
struct ChoicesAccessibilityTests {
  @Test("quand le chargement échoue, VoiceOver annonce le message d'échec affiché")
  func failureAnnounced() {
    let state = ChoicesState<String>.failed

    #expect(state.announcement(failed: "Impossible de charger.") == "Impossible de charger.")
  }

  @Test("chargement, liste ou liste vide ne déclenchent pas d'annonce", arguments: [
    ChoicesState<String>.loading, .loaded(["Fortnite"]), .empty,
  ])
  func otherStatesSilent(state: ChoicesState<String>) {
    #expect(state.announcement(failed: "Impossible de charger.") == nil)
  }
}
