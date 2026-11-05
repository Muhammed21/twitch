import Foundation

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
  public let paywallVariant: String?

  public init(sessionReplay: Bool, paywallVariant: String? = nil) {
    self.sessionReplay = sessionReplay
    self.paywallVariant = paywallVariant
  }
}

public struct Entitlement: Equatable, Sendable {
  public enum Scope: Equatable, Sendable {
    case platform
  }

  public let scope: Scope
  public let expiresAt: Date

  public init(scope: Scope, expiresAt: Date) {
    self.scope = scope
    self.expiresAt = expiresAt
  }
}

public struct AppBootstrap: Equatable, Sendable {
  public let minSupportedVersion: AppVersion
  public let flags: FeatureFlags
  public let entitlements: [Entitlement]

  public init(minSupportedVersion: AppVersion, flags: FeatureFlags, entitlements: [Entitlement] = []) {
    self.minSupportedVersion = minSupportedVersion
    self.flags = flags
    self.entitlements = entitlements
  }
}

public protocol BootstrapSource: Sendable {
  func bootstrap() async throws -> AppBootstrap
}
