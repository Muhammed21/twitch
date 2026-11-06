import Foundation
@testable import Player
import Testing

private func shown(english: String, french: String) -> String {
  Locale.preferredLanguages.first?.hasPrefix("fr") == true ? french : english
}

@Suite("Lecteur lu par VoiceOver : l'état de la vidéo est dit, pas seulement montré")
struct PlayerAccessibilityTests {
  @Test("en lecture, VoiceOver dit que la vidéo live est en cours")
  func playing() {
    #expect(PlayerText.status(of: .playing) == shown(english: "Live video playing", french: "Vidéo live en cours de lecture"))
  }

  @Test("en pause, VoiceOver dit que la vidéo est en pause")
  func paused() {
    #expect(PlayerText.status(of: .paused) == shown(english: "Video paused", french: "Vidéo en pause"))
  }

  @Test("au chargement comme en mémoire tampon, VoiceOver dit que la vidéo charge", arguments: [PlayerState.loading, .buffering])
  func loading(state: PlayerState) {
    #expect(PlayerText.status(of: state) == shown(english: "Loading video", french: "Chargement de la vidéo"))
  }

  @Test("en échec ou terminé, VoiceOver lit le message affiché")
  func failedOrEnded() {
    #expect(PlayerText.status(of: .failed) == PlayerText.failed)
    #expect(PlayerText.status(of: .ended) == PlayerText.ended)
  }

  @Test("avant le chargement, le lecteur ne dit rien")
  func idle() {
    #expect(PlayerText.status(of: .idle) == nil)
  }

  @Test("le bouton de lecture dit ce qu'il fait")
  func playButton() {
    #expect(PlayerText.play == shown(english: "Play", french: "Lecture"))
  }
}
