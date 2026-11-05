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
  @Environment(CategoryHeaderCatalog.self) private var headers
  @Environment(\.locale) private var locale
  @State private var page: CategoryLivesPage?
  @State private var header: CategoryHeaderStore?
  private let heading: CategoryHeading

  public init(heading: CategoryHeading) {
    self.heading = heading
  }

  public var body: some View {
    Group {
      if let page {
        LiveList(store: page.store) {
          CategoryHeader(
            name: heading.name,
            viewers: BrowseText.viewers(heading.viewers, locale: locale),
            coverURL: heading.imageURL,
            tags: header?.shownTags(over: heading.tags) ?? heading.tags,
            followers: header?.followers.map { BrowseText.followers($0, locale: locale) },
            follow: header.flatMap(followAction)
          )
          .padding(LayoutRole.screenInset.points)
        }
      } else {
        ColorRole.background.color.ignoresSafeArea()
      }
    }
    .confirmDialog(
      isPresented: header?.isConfirmingUnfollow == true,
      onDismiss: { header?.cancelUnfollow() },
      dialog: {
        ConfirmDialog(
          message: BrowseText.unfollowQuestion(name: heading.name),
          actions: [
            DialogAction(title: BrowseText.unfollow, kind: .destructive) { Task { await header?.confirmUnfollow() } },
            DialogAction(title: BrowseText.cancel, kind: .cancel) { header?.cancelUnfollow() },
          ]
        )
      }
    )
    .navigationTitle(heading.name)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: heading.slug) {
      page = catalog.page(for: heading.slug, keeping: page)
      let current = header?.category == heading.slug ? header : headers.store(for: heading.slug)
      header = current
      await current?.load()
    }
  }

  private func followAction(_ header: CategoryHeaderStore) -> CategoryFollowAction? {
    header.follow.state.map { state in
      CategoryFollowAction(
        isFollowing: state.isFollowing,
        label: BrowseText.followLabel(isFollowing: state.isFollowing),
        unfollowLabel: BrowseText.unfollow,
        isEnabled: !header.follow.isPending,
        onFollow: { Task { await header.followNow() } },
        onUnfollow: { header.requestUnfollow() }
      )
    }
  }
}
