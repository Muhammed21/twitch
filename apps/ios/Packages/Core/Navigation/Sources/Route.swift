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

public enum AppTab: Hashable, Sendable {
  case home
  case browse
  case profile
}

@MainActor
@Observable
public final class Router {
  public var selectedTab: AppTab = .home
  public var path: [Route] = []
  public var browsePath: [Route] = []
  public var profilePath: [Route] = []
  public var isShowingStreamManager = false

  public init() {}

  public var isTabBarVisible: Bool {
    switch selectedTab {
    case .home: path.isEmpty
    case .browse: browsePath.isEmpty
    case .profile: profilePath.isEmpty
    }
  }

  public func push(_ route: Route) {
    switch selectedTab {
    case .home: path.append(route)
    case .browse: browsePath.append(route)
    case .profile: profilePath.append(route)
    }
  }

  public func create() {
    isShowingStreamManager = true
  }

  public func reset() {
    isShowingStreamManager = false
    selectedTab = .home
    path = []
    browsePath = []
    profilePath = []
  }

  @discardableResult
  public func open(_ url: URL) -> Bool {
    guard let route = Route(deepLink: url) else { return false }
    isShowingStreamManager = false
    selectedTab = .home
    path.append(route)
    return true
  }
}
