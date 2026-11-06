import DesignSystem
import Domain
import Navigation
import SwiftUI

public struct BrowseScreen: View {
  @Environment(BrowseStore.self) private var store
  @State private var tab = BrowseTab.initial

  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      BrowseTabs(selection: $tab, items: BrowseTab.allCases.map(\.item))
        .padding(.horizontal, LayoutRole.screenInset.points)
        .padding(.top, LayoutRole.screenInset.points)
      switch tab {
      case .categories: CategoryGrid()
      case .liveChannels: LiveChannelList()
      }
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
    .task { await store.loadIfNeeded() }
  }
}

private struct CategoryGrid: View {
  @Environment(BrowseStore.self) private var store
  @Environment(\.locale) private var locale

  private var columns: [GridItem] {
    Array(
      repeating: GridItem(.flexible(), spacing: LayoutRole.categoryGridGap.points, alignment: .top),
      count: BrowseLayout.columns
    )
  }

  var body: some View {
    ScrollView {
      LazyVStack(spacing: 0) {
        LazyVGrid(columns: columns, alignment: .leading, spacing: LayoutRole.categoryRowGap.points) {
          ForEach(store.categories, id: \.slug) { category in
            NavigationLink(value: Route.category(CategoryHeading(category))) {
              CategoryTile(
                name: category.name,
                viewers: BrowseText.viewers(category.viewers, locale: locale),
                coverURL: category.imageURL,
                tag: category.tags.first
              )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("browse.category.\(category.slug.rawValue)")
          }
        }
        .padding(LayoutRole.screenInset.points)
        footer
      }
    }
    .refreshable { await store.loadFirstPage() }
  }

  @ViewBuilder private var footer: some View {
    switch store.phase {
    case .idle, .loading:
      ProgressView().frame(maxWidth: .infinity)
    case .failed:
      VStack(spacing: LayoutRole.actionGap.points) {
        Text(BrowseText.failed)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
        Button(BrowseText.retry) {
          Task { await store.retry() }
        }
        .buttonStyle(ActionButtonStyle(.secondary))
      }
    case .loaded(hasMore: true):
      ProgressView()
        .frame(maxWidth: .infinity)
        .task { await store.loadNextPage() }
    case .loaded where store.categories.isEmpty:
      Text(BrowseText.empty)
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .frame(maxWidth: .infinity)
    case .loaded:
      EmptyView()
    }
  }
}

enum BrowseLayout {
  static let columns = 3
}

enum BrowseTab: CaseIterable {
  case categories
  case liveChannels

  static let initial = BrowseTab.categories

  var title: String {
    switch self {
    case .categories: BrowseText.localized("browse.categories")
    case .liveChannels: BrowseText.localized("browse.liveChannels")
    }
  }

  var item: BrowseTabItem<BrowseTab> {
    switch self {
    case .categories: BrowseTabItem(tab: self, title: title, accessibilityIdentifier: "browse.tab.categories")
    case .liveChannels: BrowseTabItem(tab: self, title: title, accessibilityIdentifier: "browse.tab.liveChannels")
    }
  }
}

public enum BrowseText {
  public static var tabTitle: String { localized("browse.tab") }
  static var empty: String { localized("browse.empty") }
  static var failed: String { localized("browse.failed") }
  static var retry: String { localized("home.retry") }

  static func viewers(_ count: ViewerCount?, locale: Locale) -> String? {
    count.map { $0.value.formatted(.number.notation(.compactName).locale(locale)) }
  }

  static func followers(_ count: Int, locale: Locale) -> AttributedString {
    let number = count.formatted(.number.notation(.compactName).locale(locale))
    return AttributedString(localized: "category.followers \(number)", bundle: .module)
  }

  static var unfollow: String { localized("category.unfollow") }
  static var cancel: String { localized("category.cancel") }

  static func unfollowQuestion(name: String) -> String {
    String(localized: "category.unfollow.question \(name)", bundle: .module)
  }

  static func followLabel(isFollowing: Bool) -> String {
    isFollowing ? localized("category.following") : localized("category.follow")
  }

  static func localized(_ key: String.LocalizationValue) -> String {
    String(localized: key, bundle: .module)
  }
}
