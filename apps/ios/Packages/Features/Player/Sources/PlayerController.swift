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

public struct StartupRetry: Sendable {
  public typealias Schedule = @MainActor @Sendable (@escaping @MainActor () -> Void) -> Void

  public static let none = StartupRetry(attempts: 0) { _ in }

  public static func every(_ delay: Duration, attempts: Int) -> StartupRetry {
    StartupRetry(attempts: attempts) { action in
      Task { @MainActor in
        try? await Task.sleep(for: delay)
        action()
      }
    }
  }

  let attempts: Int
  let schedule: Schedule

  public init(attempts: Int, schedule: @escaping Schedule) {
    self.attempts = attempts
    self.schedule = schedule
  }
}

@MainActor
@Observable
public final class PlayerController {
  public private(set) var state: PlayerState = .idle

  private var url: URL?
  private var retriesLeft = 0
  private var generation = 0
  private let player: any MediaPlayer
  private let startupRetry: StartupRetry

  public init(player: any MediaPlayer, startupRetry: StartupRetry = .none) {
    self.player = player
    self.startupRetry = startupRetry
    player.onEvent = { [weak self] event in self?.handle(event) }
  }

  public func load(_ url: URL) {
    self.url = url
    retriesLeft = startupRetry.attempts
    start(url)
  }

  private func start(_ url: URL) {
    generation += 1
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
    generation += 1
    state = .idle
    player.stop()
  }

  public func end() {
    guard state != .idle else { return }
    generation += 1
    state = .ended
    player.stop()
  }

  public func render(into layer: AVPlayerLayer) {
    player.render(into: layer)
  }

  private func handle(_ event: MediaPlayerEvent) {
    if state == .loading, event == .failed, retriesLeft > 0, let url {
      scheduleRetry(of: url)
      return
    }
    state = Self.next(after: state, on: event)
  }

  private func scheduleRetry(of url: URL) {
    retriesLeft -= 1
    let pending = generation
    startupRetry.schedule { [weak self] in
      guard let self, generation == pending else { return }
      start(url)
    }
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
