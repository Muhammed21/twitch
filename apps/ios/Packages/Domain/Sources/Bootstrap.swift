public enum AppVersionError: Error, Equatable, Sendable {
  case malformed(String)
}

public struct AppVersion: Comparable, CustomStringConvertible, Sendable {
  public let major: Int
  public let minor: Int
  public let patch: Int

  public init(_ value: String) throws(AppVersionError) {
    let components = value.split(separator: ".", omittingEmptySubsequences: false).map(Self.number)
    guard components.count == 3, let major = components[0], let minor = components[1], let patch = components[2] else {
      throw .malformed(value)
    }
    self.major = major
    self.minor = minor
    self.patch = patch
  }

  public var description: String { "\(major).\(minor).\(patch)" }

  public static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
    (lhs.major, lhs.minor, lhs.patch) < (rhs.major, rhs.minor, rhs.patch)
  }

  private static func number(_ component: Substring) -> Int? {
    guard component.utf8.allSatisfy((UInt8(ascii: "0") ... UInt8(ascii: "9")).contains) else {
      return nil
    }
    return Int(component)
  }
}

public struct FeatureFlags: Equatable, Sendable {
  public static let safeDefaults = FeatureFlags(sessionReplay: false)

  public let sessionReplay: Bool

  public init(sessionReplay: Bool) {
    self.sessionReplay = sessionReplay
  }
}

public struct AppBootstrap: Equatable, Sendable {
  public let minSupportedVersion: AppVersion
  public let flags: FeatureFlags

  public init(minSupportedVersion: AppVersion, flags: FeatureFlags) {
    self.minSupportedVersion = minSupportedVersion
    self.flags = flags
  }
}

public protocol BootstrapSource: Sendable {
  func bootstrap() async throws -> AppBootstrap
}
