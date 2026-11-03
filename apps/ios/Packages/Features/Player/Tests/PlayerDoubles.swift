import AVFoundation
import Foundation
import Player

@MainActor
final class FakeMediaPlayer: MediaPlayer {
  var onEvent: ((MediaPlayerEvent) -> Void)?
  private(set) var calls: [String] = []

  func load(_ url: URL) {
    calls.append("load \(url.absoluteString)")
  }

  func play() {
    calls.append("play")
  }

  func stop() {
    calls.append("stop")
  }

  func render(into _: AVPlayerLayer) {}

  func send(_ event: MediaPlayerEvent) {
    onEvent?(event)
  }
}

@MainActor
final class ManualScheduler {
  private(set) var pending: [@MainActor () -> Void] = []

  func schedule(_ action: @escaping @MainActor () -> Void) {
    pending.append(action)
  }

  func runPending() {
    let actions = pending
    pending = []
    actions.forEach { $0() }
  }
}
