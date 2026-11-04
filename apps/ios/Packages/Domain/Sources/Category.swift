import Foundation

public enum CategorySlugError: Error, Equatable, Sendable {
  case malformed
}

public struct CategorySlug: Hashable, Sendable {
  public let rawValue: String

  public init(_ value: String) throws(CategorySlugError) {
    guard Self.isWellFormed(value) else {
      throw .malformed
    }
    rawValue = value
  }

  private static let maxLength = 50

  private static func isWellFormed(_ value: String) -> Bool {
    let words = value.split(separator: "-", omittingEmptySubsequences: false)
    return value.utf8.count <= maxLength
      && words.allSatisfy { !$0.isEmpty && $0.utf8.allSatisfy(isAllowed) }
  }

  private static func isAllowed(_ byte: UInt8) -> Bool {
    (UInt8(ascii: "a") ... UInt8(ascii: "z")).contains(byte)
      || (UInt8(ascii: "0") ... UInt8(ascii: "9")).contains(byte)
  }
}

public struct BrowseCategory: Equatable, Sendable {
  public let slug: CategorySlug
  public let name: String
  public let imageURL: URL?
  public let liveCount: Int
  public let viewers: ViewerCount?

  public init(slug: CategorySlug, name: String, imageURL: URL?, liveCount: Int, viewers: ViewerCount?) {
    self.slug = slug
    self.name = name
    self.imageURL = imageURL
    self.liveCount = liveCount
    self.viewers = viewers
  }
}

public protocol CategoryDirectory: Sendable {
  func categories() async throws -> [BrowseCategory]
}
