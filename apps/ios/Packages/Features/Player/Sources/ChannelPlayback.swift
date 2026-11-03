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

  public init(channels: any ChannelRepository, playback: any PlaybackSource, controller: PlayerController) {
    self.channels = channels
    self.playback = playback
    self.controller = controller
  }

  public func open(_ slug: ChannelSlug) async {
    let url: URL?
    do {
      let channel = try await channels.channel(withSlug: slug)
      url = try await playback.playbackURL(for: channel.id)
    } catch {
      url = nil
    }
    guard !Task.isCancelled else { return }
    guard let url else {
      controller.stop()
      return
    }
    opened += 1
    let screen = opened
    controller.load(url)
    await Self.untilCancelled()
    guard opened == screen else { return }
    controller.stop()
  }

  private static func untilCancelled() async {
    while !Task.isCancelled {
      try? await Task.sleep(for: .seconds(3600))
    }
  }
}
