import Domain
import Observation

@MainActor
@Observable
public final class CategoryFollowStore {
  public private(set) var state: FollowState?
  public private(set) var isPending = false
  public private(set) var hasFailed = false

  private let category: CategorySlug
  private let following: any CategoryFollowing

  public init(category: CategorySlug, following: any CategoryFollowing) {
    self.category = category
    self.following = following
  }

  public func show(_ read: FollowState) {
    guard !isPending else { return }
    state = read
  }

  public func toggle() async {
    guard let before = state, !isPending else { return }
    let after = before.toggled()
    state = after
    isPending = true
    hasFailed = false
    defer { isPending = false }
    do {
      if after.isFollowing {
        try await following.follow(category)
      } else {
        try await following.unfollow(category)
      }
    } catch {
      state = before
      hasFailed = true
    }
  }
}
