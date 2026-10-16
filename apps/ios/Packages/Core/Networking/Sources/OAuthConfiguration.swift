import Foundation

public enum ConfigurationError: Error, Equatable, Sendable {
  case missing(key: String)
  case invalidAPIBaseURL(String)
}

public struct OAuthConfiguration: Equatable, Sendable {
  public static let redirectURI = URL(string: "twitch://oauth/callback")!
  public static let callbackScheme = "twitch"
  public static let scope = "openid profile email offline_access"

  private static let apiBaseURLKey = "API_BASE_URL"
  private static let clientIDKey = "OAUTH_CLIENT_ID"
  private static let webSchemes: Set = ["http", "https"]
  private static let rootPaths: Set = ["", "/"]

  public let apiBaseURL: URL
  public let clientID: String

  public init(apiBaseURL: URL, clientID: String) {
    self.apiBaseURL = Self.origin(of: apiBaseURL)
    self.clientID = clientID
  }

  public init(infoDictionary: [String: Any]) throws(ConfigurationError) {
    let baseURL = try Self.value(of: Self.apiBaseURLKey, in: infoDictionary)
    let clientID = try Self.value(of: Self.clientIDKey, in: infoDictionary)
    guard let url = URL(string: baseURL),
          let scheme = url.scheme, Self.webSchemes.contains(scheme),
          url.host()?.isEmpty == false,
          Self.rootPaths.contains(url.path())
    else { throw .invalidAPIBaseURL(baseURL) }
    self.init(apiBaseURL: url, clientID: clientID)
  }

  public var authorizationEndpoint: URL { apiBaseURL.appending(path: "auth/oauth2/authorize") }
  public var tokenEndpoint: URL { apiBaseURL.appending(path: "auth/oauth2/token") }
  public var revocationEndpoint: URL { apiBaseURL.appending(path: "auth/oauth2/revoke") }
  public var resource: String { apiBaseURL.appending(path: "v1").absoluteString }

  private static func origin(of url: URL) -> URL {
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    components?.path = ""
    components?.query = nil
    components?.fragment = nil
    return components?.url ?? url
  }

  private static func value(of key: String, in info: [String: Any]) throws(ConfigurationError) -> String {
    guard let value = info[key] as? String, !value.isEmpty else { throw .missing(key: key) }
    return value
  }
}
