public protocol PresenceReporter: Sendable {
  func reportPresence(in channel: ChannelID) async throws
}
