public enum LiveStatus: Equatable, Sendable {
  case offline
  case live(viewers: ViewerCount?)
}

public struct LiveStatusUnavailable: Error, Equatable, Sendable {
  public let status: Int

  public init(status: Int) {
    self.status = status
  }
}

public protocol LiveStatusSource: Sendable {
  func statuses(of channel: ChannelID) async throws -> AsyncThrowingStream<LiveStatus, any Error>
}
