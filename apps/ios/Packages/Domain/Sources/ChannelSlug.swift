import Foundation

public enum ChannelSlugError: Error, Equatable, Sendable {
  case malformed
}

public struct ChannelSlug: Hashable, Sendable {
  public let rawValue: String

  public init(_ value: String) throws(ChannelSlugError) {
    guard Self.isWellFormed(value) else {
      throw .malformed
    }
    rawValue = value
  }

  private static let allowedLength = 4 ... 25

  private static func isWellFormed(_ value: String) -> Bool {
    allowedLength.contains(value.utf8.count) && value.utf8.allSatisfy(isAllowed)
  }

  private static func isAllowed(_ byte: UInt8) -> Bool {
    (UInt8(ascii: "a") ... UInt8(ascii: "z")).contains(byte)
      || (UInt8(ascii: "0") ... UInt8(ascii: "9")).contains(byte)
      || byte == UInt8(ascii: "_")
  }
}

public extension ChannelSlug {
  var appLink: URL {
    var components = URLComponents()
    components.scheme = "twitch"
    components.host = "channel"
    components.path = "/\(rawValue)"
    return components.url ?? URL(fileURLWithPath: "/")
  }
}
