import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class CategoryFollowStore {
  public static let readGrace: TimeInterval = 10

  public private(set) var state: FollowState?
  public private(set) var isPending = false
  public private(set) var hasFailed = false

  private var lastWrite: (isFollowing: Bool, at: Date)?
  private let category: CategorySlug
  private let following: any CategoryFollowing
  private let now: @Sendable () -> Date

  public init(category: CategorySlug, following: any CategoryFollowing, now: @escaping @Sendable () -> Date) {
    self.category = category
    self.following = following
    self.now = now
  }

  public func show(_ read: FollowState) {
    guard !isPending, !contradictsRecentWrite(read) else { return }
    lastWrite = nil
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
      lastWrite = (after.isFollowing, now())
    } catch {
      state = before
      lastWrite = nil
      hasFailed = true
    }
  }

  private func contradictsRecentWrite(_ read: FollowState) -> Bool {
    guard let lastWrite, read.isFollowing != lastWrite.isFollowing else { return false }
    return now().timeIntervalSince(lastWrite.at) < Self.readGrace
  }
}
