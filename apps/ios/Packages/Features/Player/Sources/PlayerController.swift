import AVFoundation
import Foundation
import Observation

public enum PlayerState: Equatable, Sendable {
  case idle
  case loading
  case playing
  case buffering
  case paused
  case failed
  case ended
}

public enum MediaPlayerEvent: Equatable, Sendable {
  case playing
  case waiting
  case paused
  case failed
  case ended
}

@MainActor
public protocol MediaPlayer: AnyObject {
  var onEvent: ((MediaPlayerEvent) -> Void)? { get set }
  func load(_ url: URL)
  func play()
  func stop()
  func render(into layer: AVPlayerLayer)
}

@MainActor
@Observable
public final class PlayerController {
  public private(set) var state: PlayerState = .idle

  private var url: URL?
  private let player: any MediaPlayer

  public init(player: any MediaPlayer) {
    self.player = player
    player.onEvent = { [weak self] event in self?.handle(event) }
  }

  public func load(_ url: URL) {
    self.url = url
    state = .loading
    player.load(url)
    player.play()
  }

  public func retry() {
    guard state == .failed, let url else { return }
    load(url)
  }

  public func resume() {
    guard state == .paused else { return }
    player.play()
  }

  public func stop() {
    state = .idle
    player.stop()
  }

  public func render(into layer: AVPlayerLayer) {
    player.render(into: layer)
  }

  private func handle(_ event: MediaPlayerEvent) {
    state = Self.next(after: state, on: event)
  }

  private static func next(after state: PlayerState, on event: MediaPlayerEvent) -> PlayerState {
    switch (state, event) {
    case (.idle, _), (.failed, _), (.ended, _): state
    case (_, .failed): .failed
    case (_, .ended): .ended
    case (_, .playing): .playing
    case (.loading, .waiting), (.loading, .paused): .loading
    case (_, .waiting): .buffering
    case (_, .paused): .paused
    }
  }
}
