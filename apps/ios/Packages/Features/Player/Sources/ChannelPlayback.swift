import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ChannelPlayback {
  private let channels: any ChannelRepository
  private let playback: any PlaybackSource
  private let controller: PlayerController

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
    controller.load(url)
  }
}
