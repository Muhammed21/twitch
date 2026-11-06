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
  public let tags: [String]
  public let language: LiveLanguage?
  public let contentLabels: Set<ContentLabel>
  public let isBrandedContent: Bool

  public init(
    id: ChannelID,
    slug: ChannelSlug,
    title: String,
    ownerID: UUID,
    category: ChannelCategory? = nil,
    bannerURL: URL? = nil,
    tags: [String] = [],
    language: LiveLanguage? = nil,
    contentLabels: Set<ContentLabel> = [],
    isBrandedContent: Bool = false
  ) {
    self.id = id
    self.slug = slug
    self.title = title
    self.ownerID = ownerID
    self.category = category
    self.bannerURL = bannerURL
    self.tags = tags
    self.language = language
    self.contentLabels = contentLabels
    self.isBrandedContent = isBrandedContent
  }
}

public protocol ChannelRepository: Sendable {
  func channel(withSlug slug: ChannelSlug) async throws -> Channel
}
