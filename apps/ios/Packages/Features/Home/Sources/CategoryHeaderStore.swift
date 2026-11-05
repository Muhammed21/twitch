import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class CategoryHeaderCatalog {
  private let details: any CategoryDetails
  private let following: any CategoryFollowing
  private let now: @Sendable () -> Date

  public init(details: any CategoryDetails, following: any CategoryFollowing, now: @escaping @Sendable () -> Date) {
    self.details = details
    self.following = following
    self.now = now
  }

  public func store(for category: CategorySlug) -> CategoryHeaderStore {
    CategoryHeaderStore(
      category: category,
      details: details,
      follow: CategoryFollowStore(category: category, following: following, now: now)
    )
  }
}

@MainActor
@Observable
public final class CategoryHeaderStore {
  public let category: CategorySlug
  public let follow: CategoryFollowStore
  public private(set) var isConfirmingUnfollow = false
  private var detail: CategoryDetail?
  private let details: any CategoryDetails

  init(category: CategorySlug, details: any CategoryDetails, follow: CategoryFollowStore) {
    self.category = category
    self.details = details
    self.follow = follow
  }

  public var tags: [String]? {
    detail?.tags
  }

  public func shownTags(over browsed: [String]) -> [String] {
    tags ?? browsed
  }

  public var followers: Int? {
    follow.state?.followers ?? detail?.followers
  }

  public func followNow() async {
    guard follow.state?.isFollowing == false else { return }
    await follow.toggle()
  }

  public func requestUnfollow() {
    isConfirmingUnfollow = follow.state?.isFollowing == true
  }

  public func cancelUnfollow() {
    isConfirmingUnfollow = false
  }

  public func confirmUnfollow() async {
    guard isConfirmingUnfollow else { return }
    isConfirmingUnfollow = false
    guard follow.state?.isFollowing == true else { return }
    await follow.toggle()
  }

  public func load() async {
    guard let read = try? await details.detail(of: category) else { return }
    detail = read
    if let state = read.follow { follow.show(state) }
  }
}
