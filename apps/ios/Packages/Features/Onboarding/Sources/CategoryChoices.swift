import Domain
import Foundation
import Observation

public enum ChoicesState<Item: Equatable & Sendable>: Equatable, Sendable {
  case loading
  case loaded([Item])
  case empty
  case failed
}

extension ChoicesState {
  func announcement(failed message: String) -> String? {
    self == .failed ? message : nil
  }
}

@MainActor
@Observable
public final class CategoryChoices {
  public private(set) var state = ChoicesState<BrowseCategory>.loading
  public private(set) var failedSlug: CategorySlug?
  private var followed: Set<CategorySlug> = []
  private var pending: Set<CategorySlug> = []

  private let directory: any CategoryDirectory
  private let following: any CategoryFollowing

  public init(directory: any CategoryDirectory, following: any CategoryFollowing) {
    self.directory = directory
    self.following = following
  }

  public var selectionCount: Int {
    followed.count
  }

  public var followedNames: [String] {
    guard case let .loaded(categories) = state else { return [] }
    return categories.filter { followed.contains($0.slug) }.map(\.name)
  }

  public func isFollowing(_ slug: CategorySlug) -> Bool {
    followed.contains(slug)
  }

  public func isPending(_ slug: CategorySlug) -> Bool {
    pending.contains(slug)
  }

  public func load() async {
    state = .loading
    do {
      let categories = try await directory.categories(after: nil).categories
      state = categories.isEmpty ? .empty : .loaded(categories)
    } catch {
      state = .failed
    }
  }

  public func toggle(_ slug: CategorySlug) async {
    guard !pending.contains(slug) else { return }
    let wasFollowing = followed.contains(slug)
    followed = wasFollowing ? followed.subtracting([slug]) : followed.union([slug])
    pending.insert(slug)
    failedSlug = nil
    defer { pending.remove(slug) }
    do {
      if wasFollowing {
        try await following.unfollow(slug)
      } else {
        try await following.follow(slug)
      }
    } catch {
      followed = wasFollowing ? followed.union([slug]) : followed.subtracting([slug])
      failedSlug = slug
    }
  }
}
