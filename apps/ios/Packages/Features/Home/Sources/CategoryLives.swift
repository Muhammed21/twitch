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
  @State private var store: HomeStore?
  private let category: CategorySlug
  private let name: String

  public init(category: CategorySlug, name: String) {
    self.category = category
    self.name = name
  }

  public var body: some View {
    Group {
      if let store {
        LiveList(store: store)
      } else {
        ColorRole.background.color.ignoresSafeArea()
      }
    }
    .navigationTitle(name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: category) {
      if store == nil { store = catalog.store(for: category) }
    }
  }
}
