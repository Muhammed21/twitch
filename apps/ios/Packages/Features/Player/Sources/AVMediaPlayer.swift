import AVFoundation
import Foundation

public extension MediaPlayerEvent {
  init?(_ status: AVPlayer.TimeControlStatus) {
    switch status {
    case .playing: self = .playing
    case .waitingToPlayAtSpecifiedRate: self = .waiting
    case .paused: return nil
    @unknown default: return nil
    }
  }

  init?(_ status: AVPlayerItem.Status) {
    guard status == .failed else { return nil }
    self = .failed
  }
}

@MainActor
public final class AVMediaPlayer: MediaPlayer {
  public var onEvent: ((MediaPlayerEvent) -> Void)?

  private let player = AVPlayer()
  private var observations: [NSKeyValueObservation] = []
  private var notifications: [any NSObjectProtocol] = []

  public init() {
    observations = [
      player.observe(\.timeControlStatus, options: [.new]) { [weak self] player, _ in
        let event = MediaPlayerEvent(player.timeControlStatus)
        Task { @MainActor in self?.emit(event) }
      },
    ]
  }

  public func load(_ url: URL) {
    stopObservingItem()
    let item = AVPlayerItem(url: url)
    observeItem(item)
    player.replaceCurrentItem(with: item)
  }

  public func play() {
    player.play()
  }

  public func stop() {
    stopObservingItem()
    player.pause()
    player.replaceCurrentItem(with: nil)
  }

  public func render(into layer: AVPlayerLayer) {
    layer.player = player
  }

  private func observeItem(_ item: AVPlayerItem) {
    observations.append(item.observe(\.status, options: [.new]) { [weak self] item, _ in
      let event = MediaPlayerEvent(item.status)
      Task { @MainActor in self?.emit(event) }
    })
    let center = NotificationCenter.default
    notifications = [
      center.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
        Task { @MainActor in self?.emit(.ended) }
      },
      center.addObserver(forName: AVPlayerItem.failedToPlayToEndTimeNotification, object: item, queue: .main) { [weak self] _ in
        Task { @MainActor in self?.emit(.failed) }
      },
    ]
  }

  private func stopObservingItem() {
    observations = Array(observations.prefix(1))
    notifications.forEach(NotificationCenter.default.removeObserver)
    notifications = []
  }

  private func emit(_ event: MediaPlayerEvent?) {
    guard let event else { return }
    onEvent?(event)
  }
}
