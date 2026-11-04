import Foundation

public protocol ChatModeration: Sendable {
  func timeout(_ user: UUID, in channel: ChannelID, for duration: Duration) async throws
}
