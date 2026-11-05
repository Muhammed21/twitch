import Foundation

public struct PaywallLinks: Equatable, Sendable {
  public let terms: URL?
  public let privacy: URL?

  public init(terms: URL?, privacy: URL?) {
    self.terms = terms
    self.privacy = privacy
  }

  public init(info: [String: Any]) {
    self.init(terms: Self.webURL(info["TERMS_URL"]), privacy: Self.webURL(info["PRIVACY_URL"]))
  }

  private static func webURL(_ value: Any?) -> URL? {
    guard
      let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      let url = URL(string: text),
      ["http", "https"].contains(url.scheme)
    else { return nil }
    return url
  }
}
