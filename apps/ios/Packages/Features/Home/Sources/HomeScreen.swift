import DesignSystem
import Domain
import Navigation
import SwiftUI

public struct HomeScreen: View {
  @Environment(HomeStore.self) private var store

  public init() {}

  public var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        ForEach(store.lives, id: \.session.channelID) { live in
          NavigationLink(value: Route.channel(live.slug)) {
            LiveRow(live: live)
          }
          .buttonStyle(.plain)
        }
        footer
          .padding(LayoutRole.screenInset.points)
      }
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
    .refreshable { await store.loadFirstPage() }
    .task {
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

private struct LiveRow: View {
  let live: LiveChannel
  @Environment(\.locale) private var locale

  var body: some View {
    LiveCard(
      badge: HomeCardText.liveBadge,
      viewers: HomeCardText.viewers(live.viewers, locale: locale),
      name: live.slug.rawValue,
      title: live.title,
      category: nil
    )
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("home.live.\(live.slug.rawValue)")
  }
}

public enum HomeCardText {
  public static var liveBadge: String { String(localized: "home.live.badge", bundle: .module) }

  public static func viewers(_ count: ViewerCount?, locale: Locale) -> String? {
    count.map {
      String(format: String(localized: "home.live.viewers", bundle: .module), $0.value.formatted(.number.notation(.compactName).locale(locale)))
    }
  }
}

public enum HomeTab {
  public static var title: String { String(localized: "home.tab", bundle: .module) }
}

enum HomeText {
  static var empty: String { String(localized: "home.empty", bundle: .module) }
  static var failed: String { String(localized: "home.failed", bundle: .module) }
  static var retry: String { String(localized: "home.retry", bundle: .module) }
}
