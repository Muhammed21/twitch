import Foundation

public enum ChatRejectionReason: Hashable, Sendable {
  case timedOut
  case rateLimited
  case unknown(String)

  public init(rawValue: String) {
    switch rawValue {
    case "timed_out": self = .timedOut
    case "rate_limited": self = .rateLimited
    default: self = .unknown(rawValue)
    }
  }

  public var rawValue: String {
    switch self {
    case .timedOut: "timed_out"
    case .rateLimited: "rate_limited"
    case let .unknown(value): value
    }
  }
}

public struct ChatAuthor: Equatable, Sendable {
  public let id: UUID
  public let name: String

  public init(id: UUID, name: String) {
    self.id = id
    self.name = name
  }
}

public struct ChatMessage: Equatable, Sendable {
  public let id: String
  public let channelID: ChannelID
  public let author: ChatAuthor
  public let body: String
  public let sentAt: Date

  public init(id: String, channelID: ChannelID, author: ChatAuthor, body: String, sentAt: Date) {
    self.id = id
    self.channelID = channelID
    self.author = author
    self.body = body
    self.sentAt = sentAt
  }
}

public enum ChatSendOutcome: Equatable, Sendable {
  case accepted
  case rejected(ChatRejectionReason)
}

public protocol ChatConnection: Sendable {
  func messages(in channel: ChannelID) -> AsyncThrowingStream<ChatMessage, any Error>
  func send(_ body: String, in channel: ChannelID) async throws -> ChatSendOutcome
}
