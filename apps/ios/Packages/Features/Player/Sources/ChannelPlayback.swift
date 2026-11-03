import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ChannelPlayback {
  private let channels: any ChannelRepository
  private let playback: any PlaybackSource
  private let controller: PlayerController
  @ObservationIgnored private var opened = 0
  @ObservationIgnored private var live: AsyncStream<Void>.Continuation?

  public init(channels: any ChannelRepository, playback: any PlaybackSource, controller: PlayerController) {
    self.channels = channels
    self.playback = playback
    self.controller = controller
  }

  public func open(_ slug: ChannelSlug) async {
    opened += 1
    let screen = opened
    let (lives, signal) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
    live = signal
    var loaded = await play(slug)
    for await _ in lives {
      loaded = await play(slug) || loaded
    }
    guard loaded, opened == screen else { return }
    controller.stop()
  }

  public func channelWentLive() {
    live?.yield()
  }

  private func play(_ slug: ChannelSlug) async -> Bool {
    let url = await url(of: slug)
    guard !Task.isCancelled else { return false }
    guard let url else {
      controller.stop()
      return false
    }
    controller.load(url)
    return true
  }

  private func url(of slug: ChannelSlug) async -> URL? {
    do {
      let channel = try await channels.channel(withSlug: slug)
      return try await playback.playbackURL(for: channel.id)
    } catch {
      return nil
    }
  }
}
