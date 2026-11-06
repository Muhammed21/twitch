import DesignSystem
import Domain
import Navigation
import SwiftUI

public struct HomeScreen: View {
  @Environment(HomeStore.self) private var store
  @Environment(BrowseStore.self) private var browse
  @Environment(CategoryLivesCatalog.self) private var catalog
  @State private var filter = HomeFilter.initial
  @State private var page: CategoryLivesPage?

  public init() {}

  public var body: some View {
    LiveList(store: page?.store ?? store) {
      ScrollingBrowseTabs(selection: $filter, items: HomeFilter.tabs(for: browse.categories))
        .padding(.top, LayoutRole.filterChipsTop.points)
        .padding(.bottom, LayoutRole.filterChipsBottom.points)
    } row: { live, generation in
      FeedRow(live: live, generation: generation)
    }
    .toolbar(.hidden, for: .navigationBar)
    .task { await browse.loadIfNeeded() }
    .onChange(of: filter) { _, current in
      page = current.category.map { catalog.page(for: $0, keeping: page) }
    }
  }
}

struct LiveChannelList: View {
  @Environment(HomeStore.self) private var store

  var body: some View {
    LiveList(store: store) { EmptyView() }
  }
}

extension LiveList where Row == LiveRow {
  init(store: HomeStore, @ViewBuilder header: () -> Header) {
    self.init(store: store, header: header) { live, generation in
      LiveRow(live: live, generation: generation)
    }
  }
}

struct LiveList<Header: View, Row: View>: View {
  let store: HomeStore
  @ViewBuilder let header: Header
  @ViewBuilder let row: (LiveChannel, Int) -> Row

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        header
        ForEach(store.lives, id: \.session.channelID) { live in
          NavigationLink(value: Route.channel(live.slug)) {
            row(live, store.thumbnailGeneration)
          }
          .buttonStyle(.plain)
        }
        footer
          .padding(LayoutRole.screenInset.points)
      }
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .refreshable { await store.loadFirstPage() }
    .announcing(HomeText.announcement(for: store.phase))
    .task(id: ObjectIdentifier(store)) {
      if store.phase == .idle { await store.loadFirstPage() }
    }
  }

  @ViewBuilder private var footer: some View {
    switch store.phase {
    case .idle, .loading:
      ProgressView().frame(maxWidth: .infinity)
    case .failed:
      VStack(spacing: LayoutRole.actionGap.points) {
        Text(HomeText.failed)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
        Button(HomeText.retry) {
          Task { await store.retry() }
        }
        .buttonStyle(ActionButtonStyle(.secondary))
      }
    case .loaded(hasMore: true):
      ProgressView()
        .frame(maxWidth: .infinity)
        .task { await store.loadNextPage() }
    case .loaded where store.lives.isEmpty:
      Text(HomeText.empty)
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .frame(maxWidth: .infinity)
    case .loaded:
      EmptyView()
    }
  }
}

private struct FeedRow: View {
  let live: LiveChannel
  let generation: Int
  @Environment(\.locale) private var locale

  var body: some View {
    VStack(spacing: 0) {
      FeedLiveCard(
        badge: HomeCardText.feedBadge,
        viewers: HomeCardText.viewers(live.viewers, locale: locale),
        name: live.slug.rawValue,
        title: live.title,
        preview: LivePreview(url: live.thumbnailURL, generation: generation),
        avatarURL: live.avatarURL
      )
      .accessibleCard(HomeCardText.card(for: live, locale: locale))
      .accessibilityIdentifier("home.live.\(live.slug.rawValue)")
      FeedDivider()
    }
  }
}

struct LiveRow: View {
  let live: LiveChannel
  let generation: Int
  @Environment(\.locale) private var locale

  var body: some View {
    LiveCard(
      badge: HomeCardText.liveBadge,
      viewers: HomeCardText.viewers(live.viewers, locale: locale),
      name: live.slug.rawValue,
      title: live.title,
      category: nil,
      preview: LivePreview(url: live.thumbnailURL, generation: generation),
      avatarURL: live.avatarURL
    )
    .accessibleCard(HomeCardText.card(for: live, locale: locale))
    .accessibilityIdentifier("home.live.\(live.slug.rawValue)")
  }
}

public enum HomeCardText {
  public static var liveBadge: String { String(localized: "home.live.badge", bundle: .module) }
  public static var feedBadge: String { String(localized: "home.feed.badge", bundle: .module) }

  public static func viewers(_ count: ViewerCount?, locale: Locale) -> String? {
    count.map {
      let shown = $0.value.formatted(.number.notation(.compactName).locale(locale))
      return String(localized: "home.live.viewers \($0.value) \(shown)", bundle: .module)
    }
  }

  public static func card(for live: LiveChannel, locale: Locale) -> AccessibleCard {
    AccessibleCard(
      parts: [live.slug.rawValue, String(localized: "home.live.spoken", bundle: .module), live.title, viewers(live.viewers, locale: locale)],
      hint: String(localized: "home.live.hint", bundle: .module)
    )
  }
}

public enum HomeTab {
  public static var title: String { String(localized: "home.tab", bundle: .module) }
}

enum HomeText {
  static var empty: String { String(localized: "home.empty", bundle: .module) }
  static var failed: String { String(localized: "home.failed", bundle: .module) }
  static var retry: String { String(localized: "home.retry", bundle: .module) }
  static var allFilter: String { String(localized: "home.filter.all", bundle: .module) }

  static func announcement(for phase: HomePhase) -> String? {
    phase == .failed ? failed : nil
  }
}
