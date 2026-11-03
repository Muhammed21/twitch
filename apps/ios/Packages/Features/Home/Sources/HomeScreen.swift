import DesignSystem
import Domain
import Navigation
import SwiftUI

public struct HomeScreen: View {
  @Environment(HomeStore.self) private var store

  public init() {}

  public var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: LayoutRole.actionGap.points) {
        ForEach(store.lives, id: \.session.channelID) { live in
          NavigationLink(value: Route.channel(live.slug)) {
            LiveRow(live: live)
          }
          .buttonStyle(.plain)
          .task {
            if live.session.channelID == store.lives.last?.session.channelID {
              await store.loadNextPage()
            }
          }
        }
        footer
      }
      .padding(LayoutRole.screenInset.points)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .navigationTitle(HomeText.title)
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

  var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.dialogTitleGap.points) {
      Rectangle()
        .fill(ColorRole.surfaceSecondary.color)
        .aspectRatio(16 / 9, contentMode: .fit)
        .accessibilityHidden(true)
      Text(live.title)
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .lineLimit(2)
      Text(live.slug.rawValue)
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textSecondary.color)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("home.live.\(live.slug.rawValue)")
  }
}

enum HomeText {
  static var title: String { String(localized: "home.title", bundle: .module) }
  static var empty: String { String(localized: "home.empty", bundle: .module) }
  static var failed: String { String(localized: "home.failed", bundle: .module) }
  static var retry: String { String(localized: "home.retry", bundle: .module) }
}
