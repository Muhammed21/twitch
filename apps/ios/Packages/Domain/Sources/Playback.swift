import Foundation

public protocol PlaybackSource: Sendable {
  func playbackURL(for channel: ChannelID) async throws -> URL?
}
