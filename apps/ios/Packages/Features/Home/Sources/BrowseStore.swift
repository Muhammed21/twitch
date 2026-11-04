import Domain
import Observation

public enum BrowsePhase: Equatable, Sendable {
  case idle
  case loading
  case loaded(hasMore: Bool)
  case failed
}

@MainActor
@Observable
public final class BrowseStore {
  private enum PageRequest {
    case first
    case next(CategoryCursor)

    var cursor: CategoryCursor? {
      switch self {
      case .first: nil
      case let .next(cursor): cursor
      }
    }
  }

  public private(set) var categories: [BrowseCategory] = []
  public private(set) var phase: BrowsePhase = .idle

  private var nextCursor: CategoryCursor?
  private var failedRequest: PageRequest?
  private let directory: any CategoryDirectory

  public init(directory: any CategoryDirectory) {
    self.directory = directory
  }

  public func loadIfNeeded() async {
    guard phase == .idle else { return }
    await load(.first)
  }

  public func loadFirstPage() async {
    await load(.first)
  }

  public func loadNextPage() async {
    guard let nextCursor else { return }
    await load(.next(nextCursor))
  }

  public func retry() async {
    guard let failedRequest else { return }
    await load(failedRequest)
  }

  private func load(_ request: PageRequest) async {
    guard phase != .loading else { return }
    phase = .loading
    do {
      let page = try await directory.categories(after: request.cursor)
      categories = Self.appending(page.categories, to: request.cursor == nil ? [] : categories)
      nextCursor = page.nextCursor
      failedRequest = nil
      phase = .loaded(hasMore: page.nextCursor != nil)
    } catch {
      failedRequest = request
      phase = .failed
    }
  }

  private static func appending(_ page: [BrowseCategory], to current: [BrowseCategory]) -> [BrowseCategory] {
    page.reduce(into: current) { categories, category in
      if !categories.contains(where: { $0.slug == category.slug }) {
        categories.append(category)
      }
    }
  }
}
