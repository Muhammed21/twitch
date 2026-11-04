import DesignSystem
import Domain
import Observation
import SwiftUI

@MainActor
@Observable
public final class CategoryLivesCatalog {
  private let source: any CategoryLives

  public init(source: any CategoryLives) {
    self.source = source
  }

  public func store(for category: CategorySlug) -> HomeStore {
    HomeStore(directory: CategoryLiveDirectory(category: category, source: source))
  }

  public func page(for category: CategorySlug, keeping current: CategoryLivesPage?) -> CategoryLivesPage {
    if let current, current.category == category { return current }
    return CategoryLivesPage(category: category, store: store(for: category))
  }
}

public struct CategoryLivesPage {
  public let category: CategorySlug
  public let store: HomeStore
}

private struct CategoryLiveDirectory: LiveDirectory {
  let category: CategorySlug
  let source: any CategoryLives

  func lives(after cursor: LiveCursor?) async throws -> LivePage {
    try await source.lives(in: category, after: cursor)
  }
}

public struct CategoryLivesScreen: View {
  @Environment(CategoryLivesCatalog.self) private var catalog
  @State private var page: CategoryLivesPage?
  private let category: CategorySlug
  private let name: String

  public init(category: CategorySlug, name: String) {
    self.category = category
    self.name = name
  }

  public var body: some View {
    Group {
      if let page {
        LiveList(store: page.store)
      } else {
        ColorRole.background.color.ignoresSafeArea()
      }
    }
    .navigationTitle(name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: category) {
      page = catalog.page(for: category, keeping: page)
    }
  }
}
