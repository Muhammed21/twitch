import AVFoundation
@testable import DesignSystem
import SwiftUI
import Testing

@MainActor
private final class FakeSounds: SoundPlaying {
  private(set) var played: [URL] = []

  func play(_ url: URL) {
    played.append(url)
  }
}

private func library(_ sounds: [FeedbackSound]) -> (FeedbackSound) -> URL? {
  { sound in sounds.contains(sound) ? URL(fileURLWithPath: "/\(sound.rawValue).wav") : nil }
}

@Suite("Retours du parcours : vibration et son par rôle (plan onboarding-paywall, PR 14)")
struct FeedbackRoleTests {
  @Test(
    "chaque rôle associe sa vibration et son son",
    arguments: [
      (FeedbackRole.selection, SensoryFeedback.selection, FeedbackSound.tap),
      (.validation, .impact(weight: .light), .validation),
      (.success, .success, .success),
      (.pageChange, .impact(flexibility: .soft), .transition),
    ]
  )
  func roles(role: FeedbackRole, haptic: SensoryFeedback, sound: FeedbackSound) {
    #expect(role.output(reduceMotion: false) == FeedbackOutput(haptic: haptic, sound: sound))
  }

  @Test("une erreur vibre sans son")
  func error() {
    #expect(FeedbackRole.error.output(reduceMotion: false) == FeedbackOutput(haptic: .error, sound: nil))
  }

  @Test("avec Réduire les animations, aucun rôle ne vibre, et le son reste", arguments: FeedbackRole.allCases)
  func reduceMotion(role: FeedbackRole) {
    let output = role.output(reduceMotion: true)

    #expect(output.haptic == nil)
    #expect(output.sound == role.output(reduceMotion: false).sound)
  }

  @Test("les quatre sons générés par packages/sounds sont dans le bundle", arguments: FeedbackSound.allCases)
  func bundled(sound: FeedbackSound) {
    #expect(FeedbackSound.bundled(sound) != nil)
  }
}

@MainActor
@Suite("Lecteur des sons du parcours, joués comme sons système")
struct FeedbackPlayerTests {
  @Test("un son du parcours laisse la catégorie audio de l'app au lecteur du live")
  func leavesAppSession() {
    let session = AVAudioSession.sharedInstance()
    let before = session.category

    FeedbackPlayer().play(.selection)

    #expect(session.category == before)
  }

  @Test("chaque rôle joue son fichier")
  func playsRoleSound() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(sounds: sounds, library: library(FeedbackSound.allCases))

    player.play(.validation)
    player.play(.pageChange)

    #expect(sounds.played == [URL(fileURLWithPath: "/validation.wav"), URL(fileURLWithPath: "/transition.wav")])
  }

  @Test("une erreur ne joue aucun son")
  func errorIsSilent() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(sounds: sounds, library: library(FeedbackSound.allCases))

    player.play(.error)

    #expect(sounds.played.isEmpty)
  }

  @Test("un son absent du bundle ne joue rien, sans erreur")
  func missingSound() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(sounds: sounds, library: library([.tap]))

    player.play(.success)
    player.play(.selection)

    #expect(sounds.played == [URL(fileURLWithPath: "/tap.wav")])
  }
}
