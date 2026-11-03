import Domain
import Foundation
import Observation

public enum Route: Hashable, Sendable {
  case channel(ChannelSlug)

  private static let scheme = "twitch"
  private static let channelHost = "channel"

  public init?(deepLink url: URL) {
    let segments = url.path().split(separator: "/")
    guard url.scheme == Self.scheme, url.host() == Self.channelHost, segments.count == 1,
          let slug = try? ChannelSlug(String(segments[0]))
    else { return nil }
    self = .channel(slug)
  }
}

@MainActor
@Observable
public final class Router {
  public var path: [Route] = []

  public init() {}

  public func push(_ route: Route) {
    path.append(route)
  }

  @discardableResult
  public func open(_ url: URL) -> Bool {
    guard let route = Route(deepLink: url) else { return false }
    push(route)
    return true
  }
}
