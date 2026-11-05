import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ChannelPlayback {
  private let channels: any ChannelRepository
  private let playback: any PlaybackSource
  private let controller: PlayerController
  private let allowsAutoplay: @MainActor () -> Bool
  @ObservationIgnored private var opened = 0
  @ObservationIgnored private var live: AsyncStream<Void>.Continuation?

  public init(
    channels: any ChannelRepository,
    playback: any PlaybackSource,
    controller: PlayerController,
    allowsAutoplay: @escaping @MainActor () -> Bool = { true }
  ) {
    self.channels = channels
    self.playback = playback
    self.controller = controller
    self.allowsAutoplay = allowsAutoplay
  }

  public func open(_ slug: ChannelSlug) async {
    opened += 1
    let screen = opened
    let (lives, signal) = AsyncStream<Void>.makeStream(bufferingPolicy: .bufferingNewest(1))
    live = signal
    var loaded = await play(slug, starts: true)
    for await _ in lives {
      loaded = await play(slug, starts: allowsAutoplay()) || loaded
    }
    guard loaded, opened == screen else { return }
    controller.stop()
  }

  public func channelWentLive() {
    live?.yield()
  }

  private func play(_ slug: ChannelSlug, starts: Bool) async -> Bool {
    let url = await url(of: slug)
    guard !Task.isCancelled else { return false }
    guard let url else {
      controller.stop()
      return false
    }
    if starts {
      controller.load(url)
    } else {
      controller.prepare(url)
    }
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
