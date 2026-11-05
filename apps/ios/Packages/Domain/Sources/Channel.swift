import Foundation

public struct ChannelID: Hashable, Sendable {
  public let rawValue: UUID

  public init(_ rawValue: UUID) {
    self.rawValue = rawValue
  }
}

public struct Channel: Equatable, Sendable {
  public let id: ChannelID
  public let slug: ChannelSlug
  public let title: String
  public let ownerID: UUID
  public let category: ChannelCategory?
  public let bannerURL: URL?

  public init(
    id: ChannelID,
    slug: ChannelSlug,
    title: String,
    ownerID: UUID,
    category: ChannelCategory? = nil,
    bannerURL: URL? = nil
  ) {
    self.id = id
    self.slug = slug
    self.title = title
    self.ownerID = ownerID
    self.category = category
    self.bannerURL = bannerURL
  }
}

public protocol ChannelRepository: Sendable {
  func channel(withSlug slug: ChannelSlug) async throws -> Channel
}
