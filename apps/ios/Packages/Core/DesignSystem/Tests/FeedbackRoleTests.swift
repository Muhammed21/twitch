import AVFoundation
@testable import DesignSystem
import SwiftUI
import Testing

private struct SessionDown: Error {}

@MainActor
private final class FakeSession: AudioSessionSetting {
  private(set) var categories: [(AVAudioSession.Category, AVAudioSession.CategoryOptions)] = []
  private(set) var activations = 0
  let fails: Bool

  init(fails: Bool = false) {
    self.fails = fails
  }

  func setCategory(_ category: AVAudioSession.Category, options: AVAudioSession.CategoryOptions) throws {
    if fails { throw SessionDown() }
    categories.append((category, options))
  }

  func setActive(_ active: Bool) throws {
    if fails { throw SessionDown() }
    if active { activations += 1 }
  }
}

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
@Suite("Lecteur des sons du parcours sur une session audio ambiante")
struct FeedbackPlayerTests {
  @Test("rien ne touche la session audio tant qu'aucun geste n'a demandé de son")
  func idleUntilGesture() {
    let session = FakeSession()
    _ = FeedbackPlayer(session: session, sounds: FakeSounds(), library: library(FeedbackSound.allCases))

    #expect(session.categories.isEmpty)
    #expect(session.activations == 0)
  }

  @Test("le premier son passe la session en ambiant, mélangée aux autres apps et muette en mode silencieux")
  func ambientSession() throws {
    let session = FakeSession()
    let player = FeedbackPlayer(session: session, sounds: FakeSounds(), library: library(FeedbackSound.allCases))

    player.play(.selection)
    player.play(.success)

    let configured = try #require(session.categories.first)
    #expect(session.categories.count == 1)
    #expect(configured.0 == .ambient)
    #expect(configured.1 == .mixWithOthers)
    #expect(session.activations == 1)
  }

  @Test("chaque rôle joue son fichier")
  func playsRoleSound() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(session: FakeSession(), sounds: sounds, library: library(FeedbackSound.allCases))

    player.play(.validation)
    player.play(.pageChange)

    #expect(sounds.played == [URL(fileURLWithPath: "/validation.wav"), URL(fileURLWithPath: "/transition.wav")])
  }

  @Test("une erreur ne joue aucun son et ne réveille pas la session")
  func errorIsSilent() {
    let session = FakeSession()
    let sounds = FakeSounds()
    let player = FeedbackPlayer(session: session, sounds: sounds, library: library(FeedbackSound.allCases))

    player.play(.error)

    #expect(sounds.played.isEmpty)
    #expect(session.categories.isEmpty)
  }

  @Test("un son absent du bundle ne joue rien, sans erreur")
  func missingSound() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(session: FakeSession(), sounds: sounds, library: library([.tap]))

    player.play(.success)
    player.play(.selection)

    #expect(sounds.played == [URL(fileURLWithPath: "/tap.wav")])
  }

  @Test("une session audio indisponible ne joue rien, sans erreur")
  func sessionDown() {
    let sounds = FakeSounds()
    let player = FeedbackPlayer(session: FakeSession(fails: true), sounds: sounds, library: library(FeedbackSound.allCases))

    player.play(.success)

    #expect(sounds.played.isEmpty)
  }
}
