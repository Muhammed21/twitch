public struct FollowState: Equatable, Sendable {
  public let isFollowing: Bool
  public let followers: Int

  public init(isFollowing: Bool, followers: Int) {
    self.isFollowing = isFollowing
    self.followers = followers
  }

  public func toggled() -> FollowState {
    FollowState(isFollowing: !isFollowing, followers: max(0, followers + (isFollowing ? -1 : 1)))
  }
}

public protocol CategoryFollowing: Sendable {
  func follow(_ category: CategorySlug) async throws
  func unfollow(_ category: CategorySlug) async throws
}
