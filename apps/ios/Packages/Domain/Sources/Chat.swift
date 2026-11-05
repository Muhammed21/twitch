import Foundation

public enum ChatRejectionReason: Hashable, Sendable {
  case timedOut
  case banned
  case rateLimited
  case notJoined
  case unknown(String)

  public init(rawValue: String) {
    switch rawValue {
    case "timed_out": self = .timedOut
    case "banned": self = .banned
    case "rate_limited": self = .rateLimited
    case "not_joined": self = .notJoined
    default: self = .unknown(rawValue)
    }
  }

  public var rawValue: String {
    switch self {
    case .timedOut: "timed_out"
    case .banned: "banned"
    case .rateLimited: "rate_limited"
    case .notJoined: "not_joined"
    case let .unknown(value): value
    }
  }
}

public enum SessionRevocation: Hashable, Sendable {
  case refreshAndReconnect
  case stop
  case unknown(String)

  public init(rawValue: String) {
    switch rawValue {
    case "refresh_and_reconnect": self = .refreshAndReconnect
    case "stop": self = .stop
    default: self = .unknown(rawValue)
    }
  }

  public var rawValue: String {
    switch self {
    case .refreshAndReconnect: "refresh_and_reconnect"
    case .stop: "stop"
    case let .unknown(value): value
    }
  }
}

public enum ChatBadge: Equatable, Sendable {
  case turbo
  case unknown(String)

  public init(rawValue: String) {
    switch rawValue {
    case "turbo": self = .turbo
    default: self = .unknown(rawValue)
    }
  }
}

public struct ChatAuthor: Equatable, Sendable {
  public let id: UUID
  public let displayName: String
  public let badges: [ChatBadge]
  public let color: String?

  public init(id: UUID, displayName: String, badges: [ChatBadge] = [], color: String? = nil) {
    self.id = id
    self.displayName = displayName
    self.badges = badges
    self.color = color
  }
}

public struct ChatMessage: Equatable, Sendable {
  public let id: UUID
  public let channelID: ChannelID
  public let sessionID: UUID?
  public let author: ChatAuthor
  public let body: String
  public let sentAt: Date
  public let isDeleted: Bool

  public init(
    id: UUID,
    channelID: ChannelID,
    sessionID: UUID?,
    author: ChatAuthor,
    body: String,
    sentAt: Date,
    isDeleted: Bool = false
  ) {
    self.id = id
    self.channelID = channelID
    self.sessionID = sessionID
    self.author = author
    self.body = body
    self.sentAt = sentAt
    self.isDeleted = isDeleted
  }

  public func deleted() -> ChatMessage {
    ChatMessage(id: id, channelID: channelID, sessionID: sessionID, author: author, body: "", sentAt: sentAt, isDeleted: true)
  }
}

public enum ChatSendOutcome: Equatable, Sendable {
  case accepted
  case rejected(ChatRejectionReason)
}

public struct ChatClearance: Equatable, Sendable {
  public let channelID: ChannelID
  public let authorID: UUID

  public init(channelID: ChannelID, authorID: UUID) {
    self.channelID = channelID
    self.authorID = authorID
  }
}

public enum ChatEvent: Equatable, Sendable {
  case message(ChatMessage)
  case cleared(ChatClearance)
  case revoked(SessionRevocation)
}

public enum ChatConnectionError: Error, Equatable, Sendable {
  case unauthorized
  case forbidden
  case unavailable
  case refused(String)
  case closed
  case ackTimedOut
  case messageTooLarge
}

public protocol ChatConnection: Sendable {
  var events: AsyncThrowingStream<ChatEvent, any Error> { get }
  func join(_ channel: ChannelID) async throws
  func leave(_ channel: ChannelID) async throws
  func send(_ body: String, in channel: ChannelID) async throws -> ChatSendOutcome
  func close() async
}

public protocol ChatConnector: Sendable {
  func connect(accessToken: String) async throws -> any ChatConnection
}
