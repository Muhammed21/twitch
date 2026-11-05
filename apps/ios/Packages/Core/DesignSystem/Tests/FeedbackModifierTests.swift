import AVFoundation
import DesignSystem
import SwiftUI
import Testing
import UIKit

@MainActor
private final class QuietSession: AudioSessionSetting {
  func setCategory(_: AVAudioSession.Category, options _: AVAudioSession.CategoryOptions) throws {}
  func setActive(_: Bool) throws {}
}

@MainActor
private final class Recorder: SoundPlaying {
  private(set) var played: [String] = []

  func play(_ url: URL) {
    played.append(url.deletingPathExtension().lastPathComponent)
  }
}

private struct Page: View {
  let taps: Int
  let player: FeedbackPlayer

  var body: some View {
    Color.clear
      .feedback(.selection, trigger: taps)
      .environment(\.feedbackPlayer, player)
  }
}

@MainActor
private func settle() async {
  for _ in 0 ..< 10 {
    try? await Task.sleep(for: .milliseconds(20))
  }
}

@MainActor
@Suite("Point d'accroche des pages : .feedback(_:trigger:) joue le retour à chaque geste")
struct FeedbackModifierTests {
  @Test("une page qui s'affiche ne joue rien ; chaque geste joue le son de son rôle")
  func playsOnTriggerOnly() async {
    let recorder = Recorder()
    let player = FeedbackPlayer(session: QuietSession(), sounds: recorder, library: { URL(fileURLWithPath: "/\($0.rawValue).wav") })
    let host = UIHostingController(rootView: Page(taps: 0, player: player))
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
    window.rootViewController = host
    window.makeKeyAndVisible()
    await settle()

    #expect(recorder.played.isEmpty)

    host.rootView = Page(taps: 1, player: player)
    await settle()
    host.rootView = Page(taps: 2, player: player)
    await settle()

    #expect(recorder.played == ["tap", "tap"])
  }
}
