import Foundation

public struct StreamSession: Equatable, Sendable {
  public let channelID: ChannelID
  public let startedAt: Date

  public init(channelID: ChannelID, startedAt: Date) {
    self.channelID = channelID
    self.startedAt = startedAt
  }
}

public struct LiveChannel: Equatable, Sendable {
  public let session: StreamSession
  public let slug: ChannelSlug
  public let title: String
  public let viewers: ViewerCount?

  public init(session: StreamSession, slug: ChannelSlug, title: String, viewers: ViewerCount? = nil) {
    self.session = session
    self.slug = slug
    self.title = title
    self.viewers = viewers
  }
}

public struct LiveCursor: Hashable, Sendable {
  public let rawValue: String

  public init(_ rawValue: String) {
    self.rawValue = rawValue
  }
}

public struct LivePage: Equatable, Sendable {
  public let lives: [LiveChannel]
  public let nextCursor: LiveCursor?

  public init(lives: [LiveChannel], nextCursor: LiveCursor?) {
    self.lives = lives
    self.nextCursor = nextCursor
  }
}

public protocol LiveDirectory: Sendable {
  func lives(after cursor: LiveCursor?) async throws -> LivePage
}
