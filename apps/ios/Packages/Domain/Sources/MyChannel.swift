import Foundation

public struct OwnedChannel: Equatable, Sendable {
  public let id: ChannelID
  public let slug: ChannelSlug

  public init(id: ChannelID, slug: ChannelSlug) {
    self.id = id
    self.slug = slug
  }
}

public struct StreamKey: Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
  public let ingestURL: URL
  private let secret: String

  public init(_ secret: String, ingestURL: URL) {
    self.secret = secret
    self.ingestURL = ingestURL
  }

  public var revealed: String { secret }

  public var description: String { "StreamKey(ingestURL: \(ingestURL), key: hidden)" }

  public var debugDescription: String { description }

  public var customMirror: Mirror { Mirror(self, children: ["ingestURL": ingestURL]) }
}

public protocol MyChannelRepository: Sendable {
  func ownedChannel() async throws -> OwnedChannel?
  func streamKey(of channel: ChannelID) async throws -> StreamKey
  func rename(_ channel: ChannelID, to title: String) async throws -> Channel
}
