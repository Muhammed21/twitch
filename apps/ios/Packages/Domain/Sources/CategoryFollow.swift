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

public struct CategoryDetail: Equatable, Sendable {
  public let tags: [String]
  public let followers: Int
  public let isFollowing: Bool?

  public init(tags: [String], followers: Int, isFollowing: Bool?) {
    self.tags = tags
    self.followers = followers
    self.isFollowing = isFollowing
  }

  public var follow: FollowState? {
    isFollowing.map { FollowState(isFollowing: $0, followers: followers) }
  }
}

public protocol CategoryDetails: Sendable {
  func detail(of category: CategorySlug) async throws -> CategoryDetail
}
