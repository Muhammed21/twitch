import Foundation

public struct AnalyticsConfiguration: Equatable, Sendable {
  public static let projectKeyInfoKey = "POSTHOG_PROJECT_KEY"
  public static let hostInfoKey = "POSTHOG_HOST"

  public let projectKey: String
  public let host: URL

  public init?(info: [String: Any]) {
    let key = (info[Self.projectKeyInfoKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !key.isEmpty, let host = Self.host(info[Self.hostInfoKey]) else {
      return nil
    }
    projectKey = key
    self.host = host
  }

  private static func host(_ value: Any?) -> URL? {
    guard let value = value as? String, let url = URL(string: value), url.scheme == "https", url.host()?.isEmpty == false else {
      return nil
    }
    return url
  }
}
